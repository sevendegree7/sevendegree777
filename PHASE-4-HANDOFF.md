# phase 4 handoff — harden + offline

> **phase 4 is done and merged.** this file was written as a plan and then
> grown as the work landed, so it reads in two halves:
>
> - **§0–§9 are the original plan**, and parts of it never happened — it says
>   "lan sync" throughout, and there is no lan (§13)
> - **§11–§20 are what was actually built**, one section per merged pr
>
> **if you are picking this project up, read §20 first**, then §13. between
> them they cover what runs today, how to build and test it, and what is left.

phase 1–3 are done in code on `main`.

read first (in order):

1. `HANDOFF.md`
2. `PHASE-2-HANDOFF.md` (pos/kds contract + gotchas)
3. `PHASE-3-HANDOFF.md` (inventory + admin + deduct)
4. this file — §20, then §13, then the section for whatever you are changing

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

> **superseded in part — read §13 first.** the owner has since confirmed the
> cashier and the kitchen are the **same single tablet**, so there is no lan and
> no second device to reach. the `client_id` rules below still hold word for
> word; the two-device transport does not.

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

---

## 13) offline: one tablet (owner decision)

the truck has **one** tablet. the cashier screen and the kitchen screen are the
same browser on the same device — the staff switch between `/pos` and `/kds`.

that removes the hard part of §2. two tablets with no internet cannot pass an
order to each other without something in the middle (a hub, a router with a
mini pc, a signalling server for webrtc). one tablet needs none of it: both
screens read the same local store in the same browser.

the plan, one small pr per step:

1. **data seam** — screens stop calling supabase and call one interface
   (done, see §14)
2. **pwa + menu cache** — the app opens with no internet and the menu is there
   (done, see §15)
3. **offline cash checkout** — a sale with no internet is written locally and
   marked pending (done, see §16)
4. **`/kds` reads local + cloud** — one board, whichever source the ticket
   came from (done, see §17)
5. **sync worker** — on reconnect, upload pending sales through the existing
   `createOrder`; `orders.client_id` is what makes a retry safe. it calls
   `setPendingSync()` so the banner says `syncing orders...` (done, see §18)
6. **offline login** — the tablet must open a shift with no internet
   (done, see §19)

what does **not** change if the hardware turns out different later: the seam,
the sync worker, the `client_id` rule, and the connection detection. only the
local store implementation would be swapped.

---

## 14) data source seam (built — step 2 of track b)

`src/lib/data/` is the only door between the screens and where data lives.

- `types.ts` — the `DataSource` interface, `MenuSnapshot`, and `Loaded<T>`
  (`{ data, error }`, so a read either answers or explains). no `"use client"`
  on purpose: server components type-import from it
- `cloud.ts` — the online implementation. supabase for reads, the **existing
  server actions** for writes
- `index.ts` — `getDataSource()`. one memoised instance per tab

rules:

- **writes stay server actions.** the local source will queue and let the
  server decide on sync. prices and role checks are never decided in the
  browser, offline or not
- when the local source lands, the choice goes **inside `getDataSource()` and
  nowhere else**. a screen must never learn which source answered
- realtime is deliberately **not** on the interface. `KdsScreen` still holds a
  raw supabase client for its channel only — realtime is a cloud-only idea, and
  the local source will need its own way to say "something changed"
- `/pos` and `/kds` still read on the server for a fast first paint. `/pos` now
  passes `initialMenu: MenuSnapshot | null`, and `null` means the screen asks
  the data source itself — that fallback is the same code path the cached
  offline menu will use

---

## 15) pwa: the app opens with no internet (built — step 2)

the tablet installs this like an app and opens it with no connection at all.
it still cannot **sell** offline — that is step 3.

what is in it:

- `src/app/manifest.ts` — the web app manifest. `start_url` is **`/pos`**, not
  `/`: `/` only ever redirects, so there is no page there to keep a copy of
- `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — drawn by
  `node scripts/make-icons.mjs`, no image library, change the script not the
  pngs
- `public/sw.js` — the service worker
- `src/components/service-worker.tsx` — registers it, mounted in the root
  layout
- `src/lib/data/menu-cache.ts` — the last menu on the device, in localstorage
- `next.config.ts` — `/sw.js` is served `no-store`, so a bad worker can always
  be replaced

how the worker decides:

| request | rule |
|---------|------|
| not GET | ignored. a cached checkout would be a lie |
| another origin (supabase) | ignored |
| `?_rsc=` payloads | ignored. they carry a build id, and next falls back to a full page load, which we can answer |
| `/_next/static/*`, icons | cache first. the name changes when the file does |
| `/pos`, `/kds`, `/login` | network first, keep the copy |
| any other page | network first, no copy — offline it gets the small "no internet" page |

**it caches nothing up front.** it keeps what the app already fetched, so the
rule for the truck is: **open the app once on wifi after every deploy.**

things to keep in mind:

- a redirect is never cached. signed out, `/pos` answers with the login page,
  and that copy would then be shown to a cashier who is signed in. the same
  rule is what makes keeping `/login` safe: while somebody is signed in that
  url only ever answers with a redirect, so the copy can only come from a
  signed-out visit — see §19
- **the worker was bumped to `v2` for that.** a version bump drops every old
  copy, so the first open after this deploy has to be on wifi
- the worker is **off in development** and the component actively unregisters
  any leftover one. a worker from a production build tested on localhost would
  keep serving that build and eat an afternoon
- offline the menu comes from the **cached page html**. the localstorage copy
  is the second line (evicted cache, and the shape step 3 prices against).
  `/pos` writes it on every load because the server read never touches the
  tablet's storage
- `MenuSnapshot.fetchedAt` drives a refresh: back online with a menu older than
  five minutes, `/pos` re-reads it. the refresh only accepts a **newer**
  snapshot — a failed read hands back the saved copy, and taking that would
  loop the effect forever
- ios only keeps storage for an app added with safari's **add to home screen**.
  a plain tab can be evicted after a week idle
- service workers need https or localhost. vercel is fine; a plain
  `http://192.168.x.x` box would never get one

how it was tested: `npm run build`, `next start`, open `/pos` and `/kds`,
**kill the server**, then reload. both screens come up with the full menu, and
an uncached page (`/admin`) gets the "no internet" page.

---

## 16) offline cash checkout (built — step 3)

with no internet the till still takes cash. the sale is written on the tablet
and waits there. **nothing uploads it yet — that is step 5.**

what is in it:

- `src/lib/data/order-store.ts` — the sales kept on the device
- `src/lib/data/local.ts` — `createLocalSource()`, the offline `DataSource`
- `src/lib/data/use-unsynced-sales.ts` — the count, as something a screen
  can watch
- `src/lib/data/index.ts` — `getDataSource()` now picks the source
- `src/app/pos/pos-screen.tsx` — the wording, and the waiting-sales line

### how the source is picked

```ts
getConnection() === "offline" ? localSource() : cloudSource()
```

**one line, one place.** the screens never know which one answered — they only
read `.kind` when the wording has to tell the truth ("saved on this tablet"
instead of "sent to kitchen").

only a confirmed `"offline"` goes local. `"checking"` stays on the cloud on
purpose: that is the first second after the app opens, and putting a sale on
the tablet while the internet is fine only creates work for the sync worker.
`"syncing"` is an online state, so it stays on the cloud too.

the source is read **once, before the `await`**. the connection can flip while
a sale is in flight, and the message has to describe where it actually went.

### what the local source will and will not do

| call | offline answer |
|------|----------------|
| `loadMenu()` | the cached menu, or "connect once, then it works offline" |
| `loadKitchenOrders()` / `loadKitchenOrder()` | fails with a plain sentence. step 4 merges the local tickets in |
| `moveStatus()` | fails. a ticket cannot move until the connection is back |
| `submitOrder()` | cash only, priced from the cached menu, written to the device |

a read it cannot answer **fails instead of returning stale data**. a kitchen
acting on an old ticket is worse than a kitchen that knows it is blind.

### the sale itself

- **cash only.** the ui already blocks card and instapay offline; the source
  refuses them again. a card sale saved on the tablet is a sale nobody
  collected the money for
- prices come from the cached menu through `cartTotal` / `lineUnitPrice` — the
  same functions the server uses, so an offline receipt and an online one agree
  to the piastre. the server prices it again from the db on upload anyway
- the product / modifier / ownership checks mirror `createOrder`. a modifier
  that does not belong to its product is refused here too
- what is stored is a full `KitchenOrder`, the same shape the cloud returns, so
  step 4 can put it on the board with no translation. `created_by` is `null`
  (the server stamps the real user on upload) and `stock_deducted` is `false`
  (stock is pulled by the server, never here)
- a failed write **throws**, and the till says *"do not take payment"*. saying
  "sold" when nothing was stored puts money in the drawer against an order that
  does not exist

### where they live

localstorage, **one key per order**: `seven-degree.order.<client_id>`.

not one json array, on purpose: `/pos` and `/kds` are often two tabs on the
same tablet, and two tabs doing read-modify-write on one list lose a sale.
nothing outside `order-store.ts` knows where they live, so indexeddb is a swap
of one file if a day of orders ever gets big.

`saveLocalOrder` returns the **existing** record untouched when the client_id
is already there — the same thing the server does with `orders.client_id`. a
re-tap must never become a second sale, and it must never reset a ticket the
kitchen already started.

the count on screen comes from `useUnsyncedSales()`, a `useSyncExternalStore`
over the same store — the same one-watcher-per-tab shape as
`use-connection.ts`. it also listens for the `storage` event, so a sale taken
on `/pos` moves the number on `/kds` in the other tab.

how it was tested: production build on `:3001`, `navigator.onLine` forced to
false plus an `offline` event so the ping loop reports offline. two cash sales
went through — the till said "saved on this tablet", the line read *"2 sales on
this tablet waiting to upload"*, and localstorage held two records with
`syncedOrderId: null` and the right totals. back online, the line survived a
reload and the next sale said "sent to kitchen" with no new local record.

---

## 17) one board, two stores (built — step 4)

step 3 put offline sales on the tablet, where nothing could see them. the
kitchen board now shows them next to the cloud tickets, and can work them.
**they still do not upload — that is step 5.**

what is in it:

- `src/lib/kds/orders.ts` — `mergeBoard(cloud, local)`
- `src/lib/data/order-store.ts` — the store publishes the tickets, not just
  the count, and gained `findLocalByOrderId` / `moveLocalStatus`
- `src/lib/data/use-local-orders.ts` — the local tickets, as something a
  screen can watch
- `src/app/kds/kds-screen.tsx` — the merged board, and the routing of a move
- `src/app/kds/components/order-card.tsx` — the "on this tablet only" badge

### routing is by ticket, not by connection

this is the whole idea of the step. the till picks its source by asking whether
the internet is up (§16); the board **cannot**, because a sale taken offline is
still missing from supabase long after the internet comes back. there is no row
to update until the sync worker has run.

so the board asks a different question — *where does this ticket live?*

```ts
if (localIds.has(order.id)) {
  moveLocalStatus(order.id, order.status, to); // this tablet
  return;
}
// otherwise the existing cloud path, unchanged
```

a local ticket moves on the tablet with the internet up or down. a cloud ticket
always goes to the server, and offline it fails with the sentence step 3
already wrote — the kitchen is told the ticket cannot move yet, which is true.

`moveLocalStatus` returns the **same `MoveStatusResult`** the server action
returns, so the board has one way to read an answer. it checks `canMove` (the
same table the server checks), and when the status has already changed — the
till tab moved it a second earlier — it reports where the ticket actually
landed instead of failing, exactly like the server does.

### the store publishes tickets now

`useUnsyncedSales` only needed a number. a status move changes no number, so
counting could not tell the board to redraw.

the store now keeps a **cached list** and compares a signature of it
(`client_id ~ status ~ updated_at ~ syncedOrderId`) before notifying. identical
reads keep the same array, so `useSyncExternalStore` sees no change and nothing
re-renders; a real change notifies both screens. `getServerSnapshot` returns
one shared empty array — a fresh `[]` each call is a render loop.

the `storage` event already in the store carries this across tabs: a sale taken
on `/pos` appears on `/kds` in the other tab **with no reload**, and a move
made on the board shows up in the till's waiting count.

### merging without showing a ticket twice

```ts
mergeBoard(cloud, local) // -> sortByOldest, cloud wins on client_id
```

two rules, and they overlap on purpose:

- `useLocalOrders` drops anything with a `syncedOrderId` — the tablet knows it
  uploaded that one
- `mergeBoard` drops a local ticket whose `client_id` is already in the cloud
  list — covers the other tab uploading it, or the record not being marked yet

the merged board is sorted oldest-first with the same `sortByOldest` the cloud
list uses, so a local sale takes its real place in the queue instead of being
pinned to the end. the kitchen works fifo across both stores.

the badge on a local card is deliberately blunt: **"on this tablet only"**.
if the tablet is wiped or the browser storage is cleared before step 5 runs,
that ticket is gone — the staff should be able to see which ones are at risk.
`onReload` is a no-op for those cards too: there is nothing to re-read.

### what is still rough (and fine for now)

- offline, the cloud tickets on the board are whatever was there when the
  internet dropped. they are not refreshed and they cannot move. the banner
  says so
- the realtime effect was left exactly as it was, deps and all. it must not
  re-subscribe every time a local sale is written
- a completed local ticket leaves the board but **stays in storage**, unsynced.
  that is correct: it still has to be uploaded and counted in the day's sales

### the note step 5 must not miss

`createOrder` always inserts a `pending` order. a local ticket that the kitchen
already walked to `ready` will come back from the upload as `pending` unless
the sync worker **catches it up** — upload, then move the new cloud order to
the status the local record holds. the local `updated_at` is there for it.

how it was tested: production build on `:3001`, two tabs (`/pos` and `/kds`).
three tickets merged fifo with the badge on the two local ones. a local ticket
walked pending → preparing → ready → picked up **while online**, survived a
full reload at each step, and left the board on completion while staying in
storage with `syncedOrderId: null`. a sale taken offline in the till tab
appeared on the board in the other tab with no reload, modifier and item note
included. offline, the board kept its tickets, a cloud ticket refused to move
with the "no internet" sentence, and a local one moved fine. no console errors
on either tab.

---

## 18) sync worker (built — step 5)

the sales sitting on the tablet now go up on their own when the internet comes
back. **this is the step that closes the offline loop** — money taken with no
connection ends up in the same tables, the same reports and the same kitchen
queue as everything else.

what is in it:

- `src/lib/data/sync.ts` — `syncPendingOrders()`, the worker
- `src/components/offline-sync.tsx` — the mount that starts it
- `src/lib/data/index.ts` — `getCloudSource()`
- `src/lib/data/order-store.ts` — `syncError` on a record, and `getUploadError`
- `src/lib/data/use-unsynced-sales.ts` — `useUploadError()`
- `src/app/pos/pos-screen.tsx` — "upload now", and the upload problem chip

### it decides nothing about the sale

the worker replays the checkout through **the same server action the till
uses**. the tablet only says which products, how many, and which extras — the
server prices it from the db, checks the role, stamps `created_by`, and pulls
stock, exactly like an online sale. an offline receipt and the row in supabase
can therefore disagree only if the menu price changed while the tablet was
away, and the db copy is the one that counts.

`orders.client_id` is what makes replaying safe: the same checkout arriving
twice returns the first order instead of charging the customer again. that is
also why two tabs running this at once cannot double a sale.

`getCloudSource()` exists for one caller. uploading is an online-only job, and
if the connection flipped mid-run `getDataSource()` would hand the worker the
*local* source — which would write the sale to the tablet a second time
instead of sending it. screens keep using `getDataSource()`.

### when it runs

- the connection goes from anything to `online` (the normal case)
- any screen mounts with a live connection
- the cashier taps **upload now** next to the waiting-sales chip

no timer, and no run when a sale is written: a sale only ever lands on the
tablet while there is no internet, so "the connection just came back" is the
whole story. a run that ends puts the banner back on `online`, which is
explicitly *not* treated as an edge — otherwise a failed sale would loop.

one run at a time per tab: a second call while one is going gets the same run.

### one sale, in order

1. upload it through `submitOrder`
2. **write the cloud id down** (`syncedOrderId`) before anything else can fail
3. catch the cloud copy up to the status this tablet has
4. drop the local record

step 2 is the important one. from that moment the money is in supabase, and a
retry must never treat the sale as un-uploaded — a record that already has a
`syncedOrderId` skips straight to step 3 on the next run.

step 3 is there because **`createOrder` always inserts a `pending` order**. a
ticket the kitchen already walked to `ready` would come back as new work
otherwise. the worker walks it one hop at a time through the same server action
a kitchen tap uses (`pending → preparing → ready → completed`, three hops at
most), so a move the kitchen is not allowed to make is not allowed here either,
and it stops early if another screen already moved the ticket further.

### when it does not work

two different failures, on purpose:

- **the server refused** (`ok: false`) — the sale stays on the tablet with the
  reason on it, and the till shows `upload problem: <reason>`. the run carries
  on to the next sale. nothing is ever dropped, and every run retries it
- **the request never came back** — the run stops there, asks the connection
  watcher to re-check, and leaves the rest for the next reconnect. throwing the
  whole queue at a dead connection only wastes it

the banner says `syncing orders...` while a run is in flight and returns to
`online` when it ends, including when sales were refused: a sale the server
will not take is not syncing, and the till says that part in words.

### known wrinkles (accepted, not bugs)

- **the ticket number changes on upload.** the local id was made on the tablet;
  supabase makes its own on insert. the kitchen sees `#6154a9b6` become
  `#6ca03896`. the fix is to let `createOrder` accept the local order id — a
  browser choosing a primary key, which is worth doing deliberately in phase 5,
  not in passing here
- a status move made **during the last round trip** can be lost, because the
  target is read just before the catch-up. it costs the kitchen one more tap on
  a ticket that is already safe in the cloud
- an uploaded sale whose catch-up failed is not in the till's waiting count —
  it is not waiting to upload, the money is already up — so it is only retried
  on the next connection edge. the upload problem chip still shows it
- **stock moves on upload, not on sale.** the deduct runs inside
  `createOrder`, so a spell offline leaves inventory reading high until the
  sales go up
- the tablet must be signed in as **admin**: `createOrder` wants
  cashier-or-admin and `moveOrderStatus` wants kitchen-or-admin, and one tablet
  runs both screens. a cashier account uploads the sale but cannot catch its
  status up

how it was tested: production build on `:3001`, two tabs. three sales left over
from step 4 (`pending`, `preparing`, `completed`) uploaded on open — the
`preparing` one came back on the board in the preparing column, the `completed`
one never appeared, and today's sales went from 105.00 to 245.00. then a fresh
offline sale (2× turkish coffee, 40.00) was started by the kitchen on the other
tab, and on reconnect the banner flashed `syncing orders...`, the record left
the tablet, and the ticket reappeared as a cloud ticket **still in preparing**.
a record pointing at a product that no longer exists was refused and kept, with
`upload problem: a product in the cart no longer exists` on the till. a record
already marked uploaded was not sent again — it only tried the catch-up, and
the day's total did not move. no console errors on either tab, no server
errors.

---

## 19) offline login (built — step 6)

the tablet opens a shift with no internet.

signing in is a request to supabase, so with no line to supabase there is
nothing anybody can type that would work. what the tablet can do is remember
the shift it opened while it still had a connection, and let that shift carry
on. that note is the whole of this step.

what is in it:

- `src/lib/auth/shift.ts` — the note, and `useShift()` to watch it
- `src/components/shift-keeper.tsx` — writes the note while there is a server
  to ask, and closes the screen when there is no note and no internet
- `src/components/role-shell.tsx` — mounts the keeper, and sign out now closes
  the shift on the device too
- `src/app/login/page.tsx` — with no internet it offers the tablet's own shift
  instead of a form that cannot work
- `src/lib/auth/roles.ts` — `ROLE_OFFLINE_HOME`
- `public/sw.js` — `/login` is kept, and `VERSION` is `v2`

### the note

`seven-degree.shift` in localstorage: user id, name, role, and when the server
last confirmed it. **no token and no password.** it is not a credential and it
cannot be used as one — the supabase session cookies are still the only thing
that reaches the server, and the server checks the role again on every write.

it is written in two places, both of them online: the login page on a
successful sign in, and `ShiftKeeper` on every screen that opens with a
connection. `RoleShell` mounts the keeper, so `/pos`, `/kds` and the admin
pages all refresh it.

it is cleared in two places: sign out, and a keeper check that comes back with
no user. a check that **fails** clears nothing — a bad ping must not shut the
tablet out of its own shift.

### what the screens do with no internet

| where | what happens |
|-------|--------------|
| `/pos`, `/kds` with a note | nothing new. the till sells cash, the board runs |
| `/pos`, `/kds` with no note | a panel over the screen: `no shift on this tablet` |
| `/pos`, `/kds`, wrong role | sent to that role's offline home |
| `/login` with a note | `continue as <name>`, straight to the till |
| `/login` with no note | says so, and that connecting once is the only way in |

the no-note panel is drawn **on top of the screen** instead of sending anyone
to `/login`, because that page needs a copy on the tablet and this is exactly
the state where there might not be one. no round trip, no dead end.

### the offline home is not the role home

`ROLE_HOME` sends an admin to `/admin`. every number on that page is a
question only the server can answer and the tablet keeps no copy of it, so
continuing an offline shift as admin used to land on the "no internet" page.
`ROLE_OFFLINE_HOME` sends admin to `/pos` instead — an owner carrying on with
no internet is standing at the till.

### a door, not a lock

with a connection, the proxy decides who may open what. offline there is no
proxy: the page came out of the service worker cache without touching the
network, so this note is the only thing between a tablet somebody picked up
and a till that takes orders. it is worth having — a signed-out tablet must
not quietly sell — but the real lock is on the server, on upload, where every
sale is priced and stamped and every role is checked again.

anyone with the device can edit localstorage. that is true of the offline
sales too. if the owner ever wants a real one, a pin on the shift note is the
phase 5 job.

### known wrinkles (accepted, not bugs)

- **the offline login screen needs a copy.** the worker keeps what was
  fetched, and while somebody is signed in `/login` only answers with a
  redirect, which is never kept. the copy comes from a signed-out visit on
  wifi — closing a shift at the end of the day is exactly that trip. without
  one, `/login` offline is the small "no internet" page, and the tablet's real
  way back in is `/pos`, which the panel handles
- **a tablet that has never signed in cannot sell.** by design. there is
  nothing to open a shift with, and inventing one on the device would be
  inventing a login
- **sign out offline drops the session locally** (`scope: "local"`) and does
  not tell supabase, so the refresh token stays valid until it expires. sales
  already on the tablet survive it and upload under whoever signs in next
- the shift note says who the tablet is open as, **not** who took the sale.
  offline sales carry no user at all; the server stamps the uploader (§18)
- a screen that goes offline in the second between mount and the first keeper
  check has no note yet and shows the panel. one reconnect fixes it, and only
  the very first sign in on a tablet can hit it

how it was tested: production build on `:3001`, service worker `v2`, **server
killed** so every page came from the cache. `/login` opened offline and
offered `continue as owner`, which landed on `/pos` with the full menu — that
is the shift opened with no internet, end to end. `/pos` offline with the note
ran as before, no panel. with the note removed it went straight to `no shift
on this tablet` over the till. a cashier note on `/kds` was sent to `/pos`.
back online, the keeper rewrote the note on load and nothing else changed. no
console errors.

---

## 20) picking this up — start here

phase 4 is **built and merged**. sections 1–9 of this file are the original
plan and parts of it never happened: §2's two-device lan model was dropped when
the owner confirmed there is only **one tablet** (§13). what actually shipped is
§11–§19.

if you are new to this file, read **§13** (the one-tablet decision), then this
section, then whichever of §14–§19 touches what you are changing.

### what the app does today

online, exactly what phases 2 and 3 did. with no internet:

- the app opens (it is installed as a pwa, `start_url` is `/pos`)
- the menu is there, from the copy on the tablet
- the till takes **cash** sales — card and instapay are blocked, they need a network
- the kitchen board shows those sales next to the cloud ones and moves them
- when the connection comes back the sales upload themselves, once, and the
  kitchen ticket is walked to the status it already had
- the tablet opens a shift with no internet, from a note it wrote while online

### the map, by job

| job | files |
|-----|-------|
| is there internet | `src/lib/connection/use-connection.ts`, `src/components/connection-banner.tsx` |
| where data comes from | `src/lib/data/types.ts`, `cloud.ts`, `local.ts`, `index.ts` |
| sales kept on the tablet | `src/lib/data/order-store.ts`, `use-unsynced-sales.ts`, `use-local-orders.ts` |
| uploading them | `src/lib/data/sync.ts`, `src/components/offline-sync.tsx` |
| the menu copy | `src/lib/data/menu-cache.ts` |
| opening with no internet | `public/sw.js`, `src/app/manifest.ts`, `src/components/service-worker.tsx` |
| who is on shift | `src/lib/auth/shift.ts`, `src/components/shift-keeper.tsx`, `src/lib/auth/roles.ts` |
| the screens | `src/app/pos/pos-screen.tsx`, `src/app/kds/kds-screen.tsx`, `src/app/login/page.tsx` |
| every write | `src/app/pos/actions.ts`, `src/app/kds/actions.ts` |

### running it

```bash
npm install
npm run dev
```

`npm run dev` is fine for everything **except** offline. the service worker is
deliberately **off in development** — a worker from a production build tested on
localhost keeps serving that build and eats an afternoon. to work on anything
offline you need a real build:

```bash
npm run build
npm run start -- -p 3001
```

you also need `.env.local` from the owner (supabase url + anon key). never
commit it.

### testing offline without unplugging anything

two different things can be "offline", and they are tested differently:

1. **the app thinks there is no internet.** in the page console:
   ```js
   Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
   dispatchEvent(new Event("offline"));
   ```
   that is what flips the banner, the data source, and the shift screens.
2. **the pages themselves have to come from the tablet.** open `/pos` and
   `/kds` once on the production build, then **kill the server** and reload.
   the connection watcher pings supabase, not this server, so the app will
   still say `online` — do (1) as well to get the real thing.

things that will waste your time if you do not know them:

- the worker keeps **only what was actually fetched** — pages *and* their js
  chunks. so: open the app once on wifi after every deploy
- bumping `VERSION` in `public/sw.js` throws every old copy away. do it
  whenever you change that file
- `/login` only gets a copy from a **signed-out** visit, because while somebody
  is signed in that url answers with a redirect, and a redirect is never cached
- the tablet has to be signed in as **admin**: one screen does the cashier's job
  and the kitchen's, and those are two different roles on the server

### rules that must not be broken

- **writes stay server actions.** prices, roles and stock are decided on the
  server, online or not. the tablet only says what was ordered
- `orders.client_id` is the dedupe key. the same sale arriving twice returns the
  first order instead of charging again — this is what makes retries safe
- `getDataSource()` is the only place the cloud/local choice is made. the one
  exception is the sync worker's `getCloudSource()`, and §18 says why
- never invent order statuses, roles, or payment methods
- the shift note is **not** a credential and must never become one — no token,
  no password on the device (§19)

### what is left

in the order i would do it:

1. **phase 5: deploy to vercel.** everything above only reaches a real tablet
   over https — service workers do not run on a plain `http://192.168.x.x` box.
   this is the step that makes the offline work usable on the truck
2. **a dry run on the actual tablet**, on truck wifi. all of phase 4 was
   verified in a desktop browser against a production build
3. **stock is not returned on a late cancel** (§12). the sql for it is sketched
   there and belongs in `supabase/phase4.sql`
4. **the ticket number changes on upload** (§18). the fix is letting
   `createOrder` accept the local order id — a browser choosing a primary key,
   worth doing deliberately
5. thermal printing (esc/pos), and the reprint stub from §3
6. touch qa on the real device: button sizes on the till and the board
7. there are **no automated tests** in this repo. everything so far was checked
   by running it. if you add a test setup, start with `src/lib/pos/money.ts` and
   `src/lib/pos/cart.ts` — pure functions, and they decide what customers pay
