# phase 4 handoff — harden + offline lan sync

**this is the next workstream.** phase 1–3 are done in code on `main`.

read first (in order):

1. `HANDOFF.md`
2. `PHASE-2-HANDOFF.md` (pos/kds contract + gotchas)
3. `PHASE-3-HANDOFF.md` (inventory + admin + deduct)
4. this file

do **not** redesign roles, order statuses, payment methods, or `client_id`.

---

## 0) teammate checklist before coding phase 4

1. `git pull origin main`
2. confirm `.env.local` has the shared supabase url + anon key
3. in supabase sql editor, confirm phase 3 ran:
   - tables exist: `inventory_items`, `recipes`, `modifier_recipes`, `waste_logs`
   - column exists: `orders.stock_deducted`
   - rpc exists: `deduct_stock_for_order`, `log_waste_and_deduct`,
     `restock_inventory_item`
   - if missing, run `supabase/phase3.sql`, `supabase/phase3-seed.sql`,
     `supabase/public-menu.sql`, then `supabase/phase3-fixes.sql`
4. smoke test:
   - admin `/admin` loads
   - cashier sells one item
   - stock drops
   - kds still gets the ticket live
5. create a branch: `phase-4-offline` (or split harden / offline branches)
6. open a pr back to `main` — do not force-push main

---

## 1) phase 4 goals

make the truck runnable when internet dies, and harden the live shift.

| goal | meaning |
|------|---------|
| harden | touch-safe ui, clear status banners, fewer foot-guns |
| offline lan | pos + kds work on the **same local wifi** with **no internet** |
| sync up | when internet returns, push local orders into supabase without duplicates |
| keep cloud path | online mode must keep working exactly like phase 2/3 |

---

## 2) offline model (agreed product rule)

```text
TRUCK (no internet, same wifi)
  cashier device  <->  local orders  <->  kitchen device

INTERNET RETURNS
  local unsynced orders  -->  supabase (orders + order_items)
                         -->  deduct_stock_for_order for each new cloud order
```

rules:

- use a **stable `client_id`** (uuid) created on the device for every checkout attempt
- supabase already has `orders.client_id` **unique** — sync must rely on this so double upload cannot create two sales
- phase 2 already uses `client_id` for double-tap protection — **do not repurpose it**
- card / instapay while offline: **block or warn** (needs network). cash can proceed offline
- admin from home still needs internet (out of scope for offline)

recommended v1 architecture (simplest that matches the product):

**pos device is the local boss while offline**

- pos writes orders to local storage (indexeddb / sqlite-ish / local api)
- kds on the same lan polls or websockets to the pos device (or a tiny local relay on the cashier machine)
- when online again, pos (or a sync worker) uploads pending local orders to supabase using the same shape as `createOrder`

alternative (heavier): small always-on local hub on the truck. only do this if pos-as-boss is not enough.

---

## 3) build order (do not start with fancy ui)

### track a — harden (can parallel with offline design)

1. ~~global connection banner on `/pos` and `/kds`: `online` / `offline` / `syncing`~~ **done** — see section 11
2. touch qa: bigger buttons if needed on cart pay / kds status
3. ~~document~~ **documented in section 12** + optionally fix: stock is **not** reversed if an order is cancelled **after** deduct (phase 3 known gap)
4. keep kds dead-socket recovery (already exists) — do not remove it
5. optional: reprint last receipt stub (esc/pos can be thin if printer not connected)

### track b — offline core

1. detect online/offline (`navigator.onLine` + real supabase ping; onLine alone lies)
2. cache menu (categories/products/modifiers) on device when online
3. offline checkout path:
   - build same line payload as today
   - store local order `{ clientId, orderType, paymentMethod, notes, lines, createdAt, synced:false, localStatus }`
   - show on pos success with local id
4. kds offline feed:
   - read local pending/preparing/ready from the lan source
   - status updates must work offline and later sync status to cloud (or upload final state)
5. sync worker when back online:
   - for each unsynced local order, call existing server action / rpc path that inserts order+items (prefer one transaction if you add an rpc)
   - on unique violation for `client_id`, mark local as synced (already on server)
   - call `deduct_stock_for_order` only for newly inserted cloud orders (cloud path already does this inside `createOrder` — prefer reusing `createOrder` so deduct stays one place)
6. never invent new order statuses

### track c — dry run

1. two browsers/devices on same wifi
2. disable internet (phone hotspot off / offline mode)
3. sell cash order → kitchen sees it
4. restore internet → order appears in supabase table + stock moved
5. no duplicate orders

---

## 4) what you must not break

from phase 2/3 — regression checklist after every phase 4 pr:

- [ ] login role redirects still work
- [ ] `/pos` createOrder online still writes orders + items
- [ ] `/kds` realtime still works online
- [ ] status moves: pending → preparing → ready → completed
- [ ] `client_id` double-tap still returns existing order
- [ ] stock deduct still runs on online sales
- [ ] admin menu / inventory / waste / reports still load
- [ ] money math still uses `src/lib/pos/money.ts` (no float totals)

---

## 5) schema notes for phase 4

prefer **no schema change** at first.

already available:

- `orders.client_id` (unique) — offline dedupe key
- `orders.stock_deducted` — deduct idempotency
- order status enum — do not rename

optional later schema (agree with teammate before adding):

- `synced_at` timestamptz on orders
- human `order_number` integer for ticket display
- local status sync table

if you add tables, put sql in `supabase/phase4.sql` and document it in this file.

---

## 6) suggested split

| person | focus |
|--------|--------|
| a | offline local store + sync up using `createOrder` / `client_id` |
| b | kds lan feed + connection banners + touch harden |

contract = local order json shape must match what `createOrder` expects (`CheckoutInput` in `src/app/pos/actions.ts`).

---

## 7) definition of phase 4 done

- truck lan, no internet: cash sale works, kitchen sees ticket, can move status
- internet returns: orders land in supabase once (no dupes), stock deducted
- online-only path still passes the phase 2 live test
- clear ui banner for connection state
- handoff notes updated with how to test offline

---

## 8) out of scope (phase 5+)

- vercel production deploy (phase 5)
- soft open / real money week (phase 6)
- multi-tenant sell-to-other-shops packaging
- full card offline capture
- perfect food-cost accounting

---

## 9) prompt starter for claude code (phase 4)

```text
you are working on seven degree pos (next.js + supabase).
read HANDOFF.md, PHASE-2-HANDOFF.md, PHASE-3-HANDOFF.md, and PHASE-4-HANDOFF.md first.
phases 1-3 are done. implement phase 4: [harden | offline-lan | sync].
do not redesign schema enums or roles.
reuse orders.client_id for offline dedupe and reuse createOrder when syncing online.
keep comments simple lowercase.
explain each new file briefly.
do not break online pos/kds/admin.
```

---

## 10) owner note

shared github: `https://github.com/sevendegree7/sevendegree777`
shared supabase project (keys via `.env.local` from owner — never commit).

---

## 11) connection detection (built — track a step 1)

files:

```text
src/lib/connection/use-connection.ts   the watcher (one per tab)
src/components/connection-banner.tsx   the strip shown on /pos and /kds
```

how it decides:

- `navigator.onLine` is only believed when it says **false** (no link at all).
  its `true` is a lie on truck wifi with a dead uplink, so we always ping.
- ping = `GET {SUPABASE_URL}/auth/v1/health` with the anon key, 4s timeout.
  anything under http 500 means the network path to our project works.
- every 20s while online, every 5s while offline, plus on the browser
  `online` / `offline` events and whenever the tab becomes visible again.
- **two** failed pings in a row before it says offline — one blip must not
  block card payments. a failure re-checks after 2s instead of 20s, so a real
  outage still shows within a few seconds.
- offline shows a `check again` button so a wrong read is never a dead end.

states: `checking` → `online` / `offline`, and `syncing` when online with
local orders still to upload. **track b calls `setPendingSync(count)`** from the
sync worker — that is the only thing that turns the banner amber. nothing sets
it yet.

read it from a component with `useConnection()`, from an event handler with
`getConnection()`, and force a ping with `checkConnection()` (already called
after any request that dies on the network, so the banner never lags).

what it changes on `/pos` while offline:

- card and instapay buttons are disabled (`needs internet`)
- if one of them was already selected, the pay button is blocked with a line
  telling the cashier to take cash
- cash is left alone — track b makes it actually save locally

`/kds` keeps its own realtime badge next to the banner. they answer different
questions, so the words were split: **`realtime live`** = the socket,
**`online`** = the internet. do not merge them.

### double-charge guard (also track a)

`clientId` used to be a fresh uuid per confirm dialog, so a checkout that died
on the network could be re-sent as a **second** order. it is now
`saleSeed + saleSignature(cart)` (`src/lib/pos/cart.ts`):

- press pay again after a network wobble → same id → the db returns the first
  order instead of charging twice
- edit the cart / payment / note → new id → a changed sale can never come back
  as the old order's total
- a sale that lands rolls the seed, so two identical carts in a row are still
  two orders

do not go back to a per-tap uuid.

---

## 12) known gap: stock is not returned on a late cancel

phase 3 pulls raw materials in `createOrder` right after the lines are written
(`deduct_stock_for_order`, guarded by `orders.stock_deducted`).

**nothing returns that stock if the order is cancelled afterwards.**

where it stands today:

- the kds cannot cancel: `ALLOWED_MOVES` in `src/lib/kds/orders.ts` only walks
  `pending → preparing → ready → completed` (plus one step back). there is no
  `cancelled` move anywhere in the ui
- the pos only writes `cancelled` when the **order lines fail to insert** — that
  path returns before the deduct rpc runs, so nothing was pulled. safe
- so the gap can only be hit by cancelling a row **by hand** in the supabase
  dashboard, and today that silently loses stock

if you add a cancel button (phase 4 or later), it must not be a plain status
update. it needs a `return_stock_for_order(order_id)` rpc that:

- only acts when `stock_deducted = true`
- adds each recipe/modifier quantity back inside postgres
  (`current_stock = current_stock + n`, never read-then-write — that race is
  already logged from the restock bug)
- sets `stock_deducted = false` in the same statement so a double tap cannot
  return the stock twice
- lives in `supabase/phase4.sql`

until then, a hand-cancelled order is fixed by restocking on
`/admin/inventory`.
