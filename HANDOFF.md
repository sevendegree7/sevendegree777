# seven degree pos — teammate handoff

give this whole file to claude code (or cursor) as project context before coding.

last updated: phase 3 on main; teammate starts phase 4 (`PHASE-4-HANDOFF.md`).

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

details, gotchas and the live test results: `PHASE-2-HANDOFF.md`.
phase 3 inventory / admin details: `PHASE-3-HANDOFF.md`.

not done yet:

- thermal printing
- offline lan sync
- reversing stock on late cancels
- deeper food-cost analytics

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
src/app/login          sign in
src/app/pos            cashier screen (shell only)
src/app/kds            kitchen screen (shell only)
src/app/admin          admin screen (shell only)
src/components         shared ui (role-shell)
src/lib/auth           role helpers
src/lib/supabase       browser/server/middleware clients
src/types/database.types.ts   typescript table shapes
src/middleware.ts      protects routes
supabase/schema.sql    create tables + rls + realtime
supabase/seed.sql      sample menu
supabase/create-profile.sql   how to link auth user -> profile
```

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

### phase 4 — next (harden + offline)
full teammate brief: **`PHASE-4-HANDOFF.md`**

- touch qa on lenovo/phone
- connection banners online/offline/syncing — **done**, `PHASE-4-HANDOFF.md` §11
- local lan offline: pos/kds work on same network
- when online again, sync orders into supabase using `client_id`
- reuse `createOrder` on sync so stock deduct stays one path
- reprint optional; do not break phase 2/3 online flows

### phase 5 — cloud go-live
- vercel deploy + prod env

### phase 6 — soft open / ready for sale
- dry run on truck, fix blockers

---

## 8) offline rule (design now, build later)

required behavior:

- on truck, devices on same local wifi can make and receive orders without internet
- when internet returns, store/sync those orders into supabase
- do not break cloud-first phase 2 while adding this later
- keep using `orders.client_id` for dedupe on sync

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

---

## 10) suggested teammate split

phase 2 (done): pos vs kds.

phase 4 (now):

- person a: offline local store + sync to supabase via `client_id` / `createOrder`
- person b: kds lan feed + online/offline banners + touch harden

full instructions: `PHASE-4-HANDOFF.md`.

---

## 11) what teammate should do now

1. `git pull origin main`
2. keep `.env.local` from owner (shared supabase)
3. run `supabase/phase3.sql` + `phase3-seed.sql` + `public-menu.sql` +
   `phase3-fixes.sql` if not already run
4. smoke test admin + one sale + stock drop + kds
5. read `PHASE-4-HANDOFF.md`
6. branch from main for phase 4 work + open pr

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

### phase 3 already done — use phase 4 prompt

```text
you are working on seven degree pos (next.js + supabase).
read HANDOFF.md, PHASE-2-HANDOFF.md, PHASE-3-HANDOFF.md, and PHASE-4-HANDOFF.md first.
phases 1-3 are done. implement phase 4 for [harden | offline-lan | sync].
do not redesign the schema or role system.
reuse orders.client_id for offline dedupe; prefer createOrder when syncing.
keep comments simple lowercase.
explain each new file briefly when you create it.
do not break online pos/kds/admin.
```

replace `[harden | offline-lan | sync]` with the assigned task.
