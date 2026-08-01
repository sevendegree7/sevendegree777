# phase 2 handoff — track a (`/pos`) and track b (`/kds`) both done

last updated: both tracks built, and the live test against the real supabase
project passed. phase 2 is done.

read `HANDOFF.md` first for project context. this file only covers what
phase 2 changed and what phase 3 needs to know.

---

## 1) what was built

### track a — `/pos`

a working cashier screen. it loads the real menu, builds a cart, and writes
real `orders` + `order_items` rows to supabase.

flow:

1. menu loads on the server (categories, available products, modifiers)
2. cashier taps a product
   - no modifiers -> straight into the cart
   - has modifiers -> popup for extras, quantity, kitchen note
3. cart shows lines, extras, notes, running total
4. cashier picks order type and payment method
5. `pay` opens a confirm dialog showing the amount
6. confirm writes the order with `status = 'pending'` and clears the cart

status starts at `pending`, so anything the cashier sends is immediately a
ticket for the kitchen. that is the contract track b consumes.

### track b — `/kds`

the kitchen board. three lanes, oldest ticket first in each:

| lane | status | button | moves to |
|------|--------|--------|----------|
| new | `pending` | `start` | `preparing` |
| preparing | `preparing` | `mark ready` | `ready` |
| ready | `ready` | `picked up` | `completed` (leaves the board) |

flow:

1. first paint is server rendered, so the board is never blank on load
2. the browser subscribes to `orders` realtime, no polling
3. any event re-reads that one ticket (row + its lines) and re-places it
4. `completed` / `cancelled` tickets drop off the board
5. each card shows waiting minutes, and turns the badge red past 10 minutes
6. modifiers are amber chips, item notes and order notes are blue, so the
   kitchen cannot miss an extra
7. every card also has a small `undo` (preparing -> pending, ready ->
   preparing) because kitchens tap the wrong card

---

## 2) files created / modified

track a:

```text
src/lib/pos/money.ts                          money math in integer piastres
src/lib/pos/cart.ts                           cart types + pricing helpers
src/app/pos/actions.ts                        server action that writes the order
src/app/pos/pos-screen.tsx                    client screen, owns all cart state
src/app/pos/components/category-tabs.tsx      category filter row
src/app/pos/components/product-grid.tsx       touch grid
src/app/pos/components/modifier-modal.tsx     extras + quantity + note popup
src/app/pos/components/cart-panel.tsx         ticket, totals, pay button
src/app/pos/components/order-type-select.tsx  takeaway | dine_in | talabat
src/app/pos/components/payment-select.tsx     cash | card | instapay
src/app/pos/components/confirm-dialog.tsx     confirm before taking money
src/app/pos/page.tsx                          modified: loads the menu
```

track b:

```text
src/lib/kds/orders.ts                         kitchen statuses, allowed moves, waiting time
src/lib/kds/queries.ts                        reads orders + their lines, one code path
src/lib/kds/use-now.ts                        one shared clock for every card
src/app/kds/actions.ts                        server action that moves a ticket
src/app/kds/kds-screen.tsx                    client board, owns realtime + state
src/app/kds/components/order-card.tsx         one ticket
src/app/kds/components/status-column.tsx      one lane
src/app/kds/page.tsx                          modified: server renders the first board
```

not touched by either track: schema, enums, rls, roles, middleware, `/admin`.

`src/lib/kds/queries.ts` takes a supabase client as an argument, so the server
page and the browser build the board with the same code.

---

## 3) how the two halves meet

the contract is the schema, nothing else:

- `/pos` only ever writes `status = 'pending'`
- `/kds` only ever moves `pending -> preparing -> ready -> completed`
- neither invents a status. `cancelled` is written by `/pos` only when the
  lines fail to insert, and the board filters it out

no shared client state, no events between the screens beyond supabase.

---

## 4) gotchas (read these before touching phase 2 code)

### a) `order_items` is not in the realtime publication

`supabase/schema.sql` line 203 adds only `orders`:

```sql
alter publication supabase_realtime add table public.orders;
```

a realtime subscription gives you the **order row only**. `/kds` therefore
treats every event as "re-read this ticket" and fetches the lines itself
(`fetchKitchenOrder` in `src/lib/kds/queries.ts`). do not expect item-level
events.

### b) an order row can arrive before its lines exist

the write is two statements: insert `orders`, then insert `order_items`.
there is no transaction across them from the client, so the realtime INSERT
event can land while the ticket still has zero items.

both sides handle this already:

- `/pos` touches the order after the lines are written, purely so kds gets a
  second event (`src/app/pos/actions.ts`)
- `/kds` treats zero items as "not written yet". it re-reads the ticket up to
  5 times with backing off delays (400ms -> 3s) and shows `loading items...`
  meanwhile. only after that does it show "no items came through yet" with a
  reload button, and it never wipes lines it already has

if this ever proves annoying, the clean fix is a postgres function that
inserts order + items in one transaction. that is a schema addition, so agree
it with the team first.

### c) there is no DELETE policy on `orders` or `order_items`

rls allows select / insert / update only. nothing can be deleted from the
client. to void an order, `update` its status to `cancelled`.

### d) two kitchen screens on the same ticket

`moveOrderStatus` matches on the old status as well as the id:

```ts
.eq("id", input.orderId).eq("status", input.from)
```

so the slower tap changes nothing instead of walking the ticket backwards.
when nothing matches, the action reads the current status and returns it, and
both screens end up showing the same thing. keep this if you touch it.

### e) the browser never sends a status

it sends `{ orderId, from, to }`, and the server checks the move against
`ALLOWED_MOVES` in `src/lib/kds/orders.ts` before writing. same rule as the
pos: the client says what it wants, the server decides what happens.

### f) money

never do float math on prices. `0.1 + 0.2` is `0.30000000000000004`, and that
is a wrong receipt. use `src/lib/pos/money.ts`, which converts to integer
piastres, does the math, and converts back. `formatMoney()` is the one display
format (`45.00 egp`).

`numeric(10,2)` columns can come back as strings from postgrest, so every read
forces `Number(...)`. `src/lib/kds/queries.ts` does this for orders, lines and
each modifier inside `selected_modifiers`. do the same anywhere new.

### g) prices are re-read from the db at checkout

`createOrder` ignores whatever prices the browser sends. it re-fetches products
and modifiers by id, verifies each modifier actually belongs to its product,
and recomputes the total server side.

### h) double submit is guarded by `client_id`

each checkout attempt generates one uuid, sent as `orders.client_id`, which is
`unique` in the schema. a double tap hits the unique violation and the action
returns the existing order instead of charging twice. this is also the field
phase 4 offline sync will dedupe on — do not repurpose it.

### i) the board recovers from a dead socket

a kitchen tablet that sleeps can lose the websocket silently. `/kds` refetches
everything on `SUBSCRIBED` and whenever the tab becomes visible again, shows a
red `not live` pill when the channel drops, and has a manual `refresh`. that is
the safety net instead of polling.

---

## 5) conventions used

- filenames are **kebab-case** (`product-grid.tsx`, `order-card.tsx`),
  matching the existing `role-shell.tsx`
- comments are simple lowercase, per `HANDOFF.md`
- tailwind only, no custom css, no framer motion yet
- writes go through a server action, reads can use either client
- `RoleShell` is reused so sign out and role redirects stay intact
- the clock on the cards comes from `useNow()`, which returns `null` during
  server render so hydration never mismatches. if you add time to a card, use
  that hook, do not call `Date.now()` in render

---

## 6) state of the checks

| check | result |
|-------|--------|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean, `/pos` and `/kds` are dynamic (they read cookies) |
| cart + money math | 11 unit checks passed, including float-drift cases |
| kds helpers | 24 checks passed: allowed moves, undo, rejected moves, waiting time, fifo order |
| kds board render | rendered in a browser with fake tickets: three lanes, fifo order, late badge, modifier chips, notes, empty-ticket state, no hydration errors |
| route protection | `/pos` and `/kds` still redirect signed-out users to `/login` |
| live test against real supabase | passed, see section 7 |

---

## 7) the live test (passed)

run against the real supabase project, signed in as admin, `/pos` in one tab
and `/kds` in another, neither tab reloaded during the test:

| step | result |
|------|--------|
| menu loads from the db | 4 categories, 8 products, modifiers on the right ones |
| modifier popup, qty 2, `extra icing` | `add · 100.00 egp`, so `(45 + 5) x 2` is right |
| cart with a second product | total `120.00 egp` |
| confirm payment (dine in, cash) | order written, cart cleared |
| ticket on `/kds` | appeared in `new` on its own, no refresh: `#261621a9`, `dine in · 3 items`, amber `extra icing` chip, blue item note, blue `order note: table 4` |
| `start` | moved to preparing |
| `mark ready` | moved to ready |
| `undo` from ready | back to preparing |
| `picked up` | left the board, all three lanes empty again |
| second order, one line | arrived live, read `1 item` not `1 items` |
| console errors, either tab | none |

so the definition of done in `HANDOFF.md` section 12 is met: products from db,
cart and modifiers, pay writes the order, kds updates live without refresh,
`pending -> preparing -> ready` works, role redirects intact.

if a ticket ever stops appearing live but shows up after tapping `refresh`, the
problem is realtime, not the board — check database -> replication in the
supabase dashboard, the publication must include `orders`.

---

## 8) what is left

phase 2 is done. phase 3 inventory/admin is done — see `PHASE-3-HANDOFF.md`.

**next: phase 4** — see `PHASE-4-HANDOFF.md` (harden + offline lan sync).

---

## 9) smaller things worth knowing

- `/pos` hides products where `is_available` is false. admin menu can toggle this now (phase 3)
- the cart merges a repeat tap of the same product with the same extras and the
  same note into one line with a higher quantity
- `/kds` shows the ticket id short form (`#0d5a9f1e`), the same slice the pos
  shows the cashier after payment. there is no human order number in the schema
  yet — if the truck wants "order 42", that is a schema addition
- a ticket older than 10 minutes gets a red badge (`LATE_MINUTES` in
  `order-card.tsx`)
- `npm audit` reports 12 high severity issues, all transitive dev tooling inside
  next.js itself (eslint / postcss / sharp). fixing them means downgrading next,
  so they were left alone
- next.js 16 prints a deprecation warning for the `middleware` file convention
  and wants `proxy` instead. `src/middleware.ts` still works. worth migrating
  before the vercel deploy in phase 5, and worth checking first if role
  redirects ever start misbehaving
