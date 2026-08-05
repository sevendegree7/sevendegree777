# seven degree pos — teammate handoff

give this whole file to claude code (or cursor) as project context before coding.

last updated: phases 1–4 are done and merged into main. phase 5 (deploy) is next.

**picking this up for the first time?** read this file for the shape of the
project, then `PHASE-4-HANDOFF.md` §13 and §20 — §13 is the decision that
changed the design (there is only one tablet), §20 is what runs today, how to
build it, how to test it with no internet, and what is left.

---

## 1) what this project is

custom cloud pos for a bakery / food truck (brownies, cinnabon, croissants, drinks).

goals:

- touch-friendly cashier pos
- kitchen display (kds) with live orders
- inventory + recipes (bom) + waste later
- admin dashboard for menu, prices, reports
- later: local lan offline mode, then sync to cloud when online

stack:

- frontend: next.js (app router) + typescript + tailwind + framer motion (motion later)
- backend: supabase (auth, postgres, realtime)
- deploy later: vercel + supabase
- printing later: esc/pos thermal

repo (private):

- https://github.com/sevendegree7/sevendegree777.git

---

## 2) current status (what is already done)

phase 1 foundation is done on `main`:

- next.js app scaffolded (`src/` app router)
- supabase sql schema + seed menu
- auth login page
- 3 roles with redirects and route protection
- empty home shells for `/admin`, `/pos`, `/kds`
- docs: `README.md`, `SETUP.md`, `GITHUB-ACCOUNTS.md`

phase 2 is done on top of it, and tested live against the real supabase project:

- `/pos` real cart, modifiers, payment, writes `orders` + `order_items`
- `/kds` realtime kitchen board with the status pipeline
- verified end to end: cashier order showed up on the kitchen board on its own
  and walked `pending -> preparing -> ready -> completed` without a refresh

phase 3 code is in the repo (admin + inventory + bom deduct):

- run `supabase/phase3.sql`, `supabase/phase3-seed.sql`, `supabase/public-menu.sql`,
  then `supabase/phase3-fixes.sql` on your project
- details: `PHASE-3-HANDOFF.md`

phase 4 is done and merged — the truck can now trade with no internet:

- the app opens with no signal (pwa + service worker), on the tablet's own copy
  of `/pos`, `/kds` and `/login`
- cash sales are taken offline and kept on the device; card and instapay are
  blocked, they need a network
- the kitchen board shows those sales next to the cloud ones and moves them
- when the connection returns the sales upload themselves, once — a repeat of
  the same sale cannot double-charge, `orders.client_id` sees to that
- the tablet opens a shift with no internet, from a note it wrote while online
- the kitchen can void a ticket, and the raw materials go back on the shelf
  (§12) — this one needs `supabase/phase4.sql` run on the project
- built in small merged prs, each tested live against a production build:
  `PHASE-4-HANDOFF.md` §11–§20

details, gotchas and the live test results: `PHASE-2-HANDOFF.md`.
phase 3 inventory / admin details: `PHASE-3-HANDOFF.md`.
phase 4 offline details, and the map of which file does what: `PHASE-4-HANDOFF.md`.

not done yet:

- deployment (phase 5) — nothing is hosted yet, and the offline work only
  reaches a real tablet over https
- a dry run on the actual tablet on truck wifi
- thermal printing
- deeper food-cost analytics
- automated tests — there are none; everything so far was checked by running it

public customer menu: `/menu` (qr) — see `SETUP.md` / `supabase/public-menu.sql`

---

## 3) roles (important)

| role | after login | allowed routes |
|------|-------------|----------------|
| admin | `/admin` | `/admin`, `/pos`, `/kds` |
| cashier | `/pos` | `/pos` only |
| kitchen | `/kds` | `/kds` only |

enforced in:

- `src/lib/auth/roles.ts`
- `src/middleware.ts`
- `src/lib/supabase/middleware.ts`

staff users live in supabase auth. each auth user must have a matching row in `public.profiles` with the correct `role`.

---

## 4) folder map

```text
src/app/login          sign in, and the offline "continue as" screen
src/app/pos            cashier till + its server actions (every write)
src/app/kds            kitchen board + its server actions
src/app/admin          menu, inventory, recipes, waste, reports
src/app/menu           public qr menu (no login)
src/app/manifest.ts    pwa manifest, start_url is /pos
src/components         shared ui: role-shell, connection banner,
                       service worker, offline sync, shift keeper
src/lib/auth           role helpers + the device's shift note
src/lib/connection     is there internet, watched in one place
src/lib/data           the cloud/local seam, offline orders, upload
src/lib/pos            cart + money maths (pure functions)
src/lib/kds            kitchen queries + order helpers
src/lib/supabase       browser/server/middleware clients
src/types/database.types.ts   typescript table shapes
src/middleware.ts      protects routes
public/sw.js           the offline copy of the app shell
supabase/schema.sql    create tables + rls + realtime
supabase/seed.sql      sample menu
supabase/create-profile.sql   how to link auth user -> profile
```

which file does which job in the offline work: `PHASE-4-HANDOFF.md` §20.

comments style in this project: simple lowercase, no fancy caps.

example:

```ts
// this field for the kitchen
// used later for offline sync
```

---

## 5) database schema (phase 1)

enums:

- `user_role`: `admin | cashier | kitchen`
- `payment_method`: `cash | card | instapay`
- `order_type`: `takeaway | dine_in | talabat`
- `order_status`: `pending | preparing | ready | completed | cancelled`

tables:

### profiles
- `id` uuid pk (= `auth.users.id`)
- `name` text
- `role` user_role
- `created_at`

### categories
- `id`, `name`, `icon`, `color`, `sort_order`, `created_at`

### products
- `id`, `category_id`, `name`, `base_price`, `is_available`, `sort_order`, `created_at`

### modifiers
- `id`, `product_id`, `name`, `extra_price`, `created_at`

### orders
- `id`
- `client_id` text unique (nullable) — reserved for offline sync later
- `total_amount`
- `payment_method`
- `order_type` default `takeaway`
- `status` default `pending`
- `notes`
- `created_by` -> profiles
- `created_at`, `updated_at`

### order_items
- `id`, `order_id`, `product_id`
- `product_name` (snapshot name at sale time)
- `quantity`, `unit_price`
- `selected_modifiers` jsonb (array of `{id,name,extra_price}`)
- `notes`, `created_at`

rls is on. logged-in staff can read menu/orders. admin writes menu. cashier/admin insert orders. cashier/kitchen/admin update orders.

realtime publication includes `orders` for future kds.

source of truth sql:

- `supabase/schema.sql`
- `supabase/seed.sql`

do not invent new order status names. do not rename these enums without talking to the team.

---

## 6) env setup

copy `.env.example` -> `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

never commit `.env.local`.

local run:

```bash
npm install
npm run dev
```

open http://localhost:3000

---

## 7) product plan (phases)

### phase 1 — done
foundation: schema, auth, role homes

### phase 2 — done (core money + kitchen)
built:

1. `/pos`
   - load categories/products/modifiers from supabase
   - touch grid + modifiers
   - cart + totals
   - payment: cash | card | instapay
   - order type: takeaway | dine_in | talabat
   - create `orders` + `order_items`
   - status starts as `pending`
2. `/kds`
   - subscribe to `orders` realtime
   - show pending/preparing/ready cards
   - big buttons to move status
   - highlight modifiers / notes
3. optional early: esc/pos print test

done when: cashier creates order -> kitchen sees it live -> can mark ready.

### phase 3 — done (inventory + admin control)
- `inventory_items`, `recipes`, `modifier_recipes`, `waste_logs`
- bom deduct on sale via `deduct_stock_for_order`
- waste / restock / menu price+availability
- admin reports (basic)
- see `PHASE-3-HANDOFF.md`

### phase 4 — done (harden + offline)
full details: **`PHASE-4-HANDOFF.md`** — §13 for the decision that shaped it,
§20 for what runs today and how to work on it.

- connection banners online/offline/syncing — §11
- one tablet, not a lan: the till and the kitchen board are the same browser,
  so they share one store on the device — §13
- the app opens with no internet (pwa + service worker) — §15
- cash sales taken offline and kept on the tablet — §16
- the board shows offline and cloud orders together — §17
- sales upload themselves when the internet is back, deduped on
  `orders.client_id`, through the same `createOrder` as an online sale, so
  stock deduct stays one path — §18
- the shift opens with no internet, from a note written while online — §19
- voiding a ticket puts the raw materials back — §12

still open from this phase: touch qa on the real tablet, and reprint.

### phase 5 — cloud go-live (next)
- vercel deploy + prod env
- https is not optional: service workers do not run without it, so nothing in
  phase 4 reaches the real tablet until this is done

### phase 6 — soft open / ready for sale
- dry run on truck, fix blockers

---

## 8) offline rule (built — and it is not a lan)

this section used to describe devices talking to each other over the truck's
wifi. that was dropped: the owner confirmed the truck has **one tablet**, and
the cashier and the kitchen are the same person looking at the same screen.
`/pos` and `/kds` are two tabs of one browser, so they share one store on the
device and nothing has to travel anywhere. the reasoning is in
`PHASE-4-HANDOFF.md` §13.

what the rule is now:

- the tablet trades with no internet at all — not "no internet between
  devices", none
- cash only offline. card and instapay need a network, so they are blocked
- sales are kept on the device and upload when the internet returns
- `orders.client_id` is still the dedupe key, and it is what makes a retry
  safe: the same sale arriving twice returns the first order instead of
  charging again
- the cloud-first path from phase 2 was not touched — online, the same code
  runs as before

---

## 9) coding rules for ai (claude code / cursor)

1. read existing schema/types before creating tables or fields
2. match existing status/payment/order_type enums exactly
3. keep role redirects working
4. prefer extending schema over rewriting it
5. simple lowercase comments
6. do not commit secrets
7. phase 2 should write real rows to `orders` / `order_items` (no fake-only local cart as final solution)
8. ui can be plain first; polish after flow works
9. if changing shared spine (`orders`, auth, roles), tell the teammate before merging
10. every write stays a server action. prices, roles and stock are decided on
    the server, online or not — the tablet only says what was ordered
11. `getDataSource()` is the only place the cloud/local choice is made (the one
    exception is the sync worker, and `PHASE-4-HANDOFF.md` §18 says why)
12. the tablet's shift note is not a credential and must not become one — no
    token and no password on the device

---

## 10) suggested teammate split

phase 2 (done): pos vs kds.
phase 4 (done): built in six small prs, one per step, each merged on its own.

phase 5 splits badly — deploying is one person's job. the work that can run
next to it: the late-cancel stock fix (`PHASE-4-HANDOFF.md` §12), thermal
printing, and touch qa on the real tablet.

---

## 11) what teammate should do now

1. `git pull origin main`
2. get `.env.local` from the owner (shared supabase) — it is not in the repo
3. run `supabase/phase3.sql` + `phase3-seed.sql` + `public-menu.sql` +
   `phase3-fixes.sql` on the project if they have not been run, and
   `supabase/phase4.sql` — that last one is what makes a voided ticket give its
   ingredients back, and voids lose stock until it is in
4. `npm install`, then `npm run dev` and smoke test: admin, one sale, the stock
   drop, the kitchen board
5. read `PHASE-4-HANDOFF.md` §13 (the one-tablet decision) and §20 (what runs
   today, how to build and test it offline, what is left)
6. to see the offline side at all you need a production build — the service
   worker is off in dev on purpose:

   ```bash
   npm run build
   npm run start -- -p 3001
   ```

   open `/pos` and `/kds` once, then stop the server and reload. §20 explains
   why the app may still say "online" when you do that, and how to fake a dead
   connection properly
7. branch from main, one small pr per piece of work — do not force-push main

---

## 12) definition of phase 2 done

- products from db show on pos
- cart + modifiers work
- pay creates order in supabase
- kds updates live without refresh
- status pipeline works: pending -> preparing -> ready
- cashier/kitchen/admin still land on correct screens

(phase 2 met — see `PHASE-2-HANDOFF.md` live test.)

---

## 13) prompt starter for claude code

### phases 1–4 are done — use the phase 5 prompt

```text
you are working on seven degree pos (next.js + supabase), a pos for a food truck.
read HANDOFF.md first, then PHASE-4-HANDOFF.md sections 13 and 20.
phases 1-4 are done and merged. i am working on [deploy | printing | stock fix | touch qa].
the truck has one tablet: /pos and /kds are the same browser. there is no lan.
do not redesign the schema or the role system.
every write stays a server action. orders.client_id is the offline dedupe key.
getDataSource() is the only place the cloud/local choice is made.
keep comments simple lowercase.
explain each new file briefly when you create it.
do not break the online pos/kds/admin flows, or the offline ones.
```

replace `[deploy | printing | stock fix | touch qa]` with the task in hand.

note for whoever prompts an ai on this repo: `AGENTS.md` says this next.js is
newer than the model's training data, and the docs shipped inside
`node_modules/next/dist/docs/` are the ones to trust. `middleware` is on its
way out in favour of `proxy` — the build already prints `ƒ Proxy (Middleware)`
for `src/middleware.ts`.
