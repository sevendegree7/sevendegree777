# phase 3 handoff — inventory, recipes, waste, admin

last updated: phase 3 merged to `main` for teammate phase 4 kickoff.

read `HANDOFF.md` and `PHASE-2-HANDOFF.md` first.
**next work:** `PHASE-4-HANDOFF.md` (harden + offline).

---

## 1) what was built

- inventory items (raw stock)
- product recipes (bom) + modifier recipes
- auto stock deduct when `/pos` creates an order
- waste logging (stock down, not sales)
- admin ui:
  - overview (today sales, low stock)
  - menu (price + availability)
  - inventory (restock + min threshold)
  - waste
  - recipes editor
  - reports (30-day sales, payment, type, top items, by day)

---

## 2) sql you must run in supabase

existing projects already ran `schema.sql` + `seed.sql`. now run in order:

1. `supabase/phase3.sql`
2. `supabase/phase3-seed.sql`
3. `supabase/public-menu.sql`
4. `supabase/phase3-fixes.sql`

if you skip this, admin inventory pages show a warning and deduct rpc will fail
(sale still saves; stock just will not move). skipping step 4 specifically makes
the restock button return "run supabase/phase3-fixes.sql in the sql editor first".

the sql editor runs **only the highlighted text** when there is a selection —
click into the editor and make sure nothing is selected before pressing run.

### new tables / objects

| name | purpose |
|------|---------|
| `inventory_items` | name, unit (`g`/`ml`/`pcs`), `current_stock`, `min_threshold` |
| `recipes` | product_id + inventory_item_id + quantity_required |
| `modifier_recipes` | modifier_id + inventory_item_id + quantity_required |
| `waste_logs` | inventory_item_id, quantity, reason, notes, logged_by |
| `orders.stock_deducted` | boolean, default false |
| rpc `deduct_stock_for_order(uuid)` | bom pull for one order |
| rpc `log_waste_and_deduct(...)` | waste row + stock pull |

waste reasons enum: `burnt | dropped | expired | spoiled | remake | other`

---

## 3) deduct rule

when: right after order lines are written in `createOrder` (`src/app/pos/actions.ts`)

how: `rpc deduct_stock_for_order(order_id)`

- uses `recipes` for each product line
- uses `modifier_recipes` for each selected modifier
- multiplies by line quantity
- sets `orders.stock_deducted = true` so it never double-deducts
- skips cancelled orders
- allows negative stock so rush sales never fail

if deduct rpc errors, the order still succeeds (kitchen still gets the ticket).

**known gap:** if an order is cancelled *after* deduct, stock is not auto-returned. phase 4 may address.

---

## 4) admin routes

| route | job |
|-------|-----|
| `/admin` | today sales + low stock |
| `/admin/menu` | price + is_available |
| `/admin/inventory` | restock + min threshold |
| `/admin/inventory/waste` | waste form + recent logs |
| `/admin/recipes` | bom editor |
| `/admin/reports` | 30-day summaries |

nav: `src/components/admin-shell.tsx`  
mutations: `src/app/admin/actions.ts`

only admin role should use these (middleware already allows admin everywhere).

---

## 5) files

```text
supabase/phase3.sql
supabase/phase3-seed.sql
src/types/database.types.ts          updated
src/app/pos/actions.ts               calls deduct rpc
src/components/admin-shell.tsx       admin nav
src/app/admin/actions.ts             server actions
src/app/admin/page.tsx               overview
src/app/admin/menu/*
src/app/admin/inventory/*
src/app/admin/inventory/waste/*
src/app/admin/recipes/*
src/app/admin/reports/*
PHASE-3-HANDOFF.md
PHASE-4-HANDOFF.md                   next for teammate
```

schema enums/tables from phase 1-2 were not renamed.

---

## 6) freebies

no separate freebie table in phase 3.

to give something free and still hit stock:

- sell it on pos with a 0-price product, or
- keep normal price product and treat comps via waste/remake if food was made then given away

sales reports exclude `cancelled` only, so a 0-price line still deducts stock on create.

---

## 7) test checklist

1. run phase3 sql + seed
2. login admin → `/admin` shows inventory cards
3. open `/admin/inventory` — flour etc listed
4. open `/admin/recipes` — cinnabon lines exist
5. login cashier → sell 1 classic cinnabon
6. back to admin inventory → flour/butter/sugar/cinnamon dropped
7. log waste on flour → stock drops again, reports sales unchanged
8. menu: set a product unavailable → pos hides it after refresh
9. pos + kds still work like phase 2

---

## 8) not in phase 3 / go to phase 4

- offline lan sync → **`PHASE-4-HANDOFF.md`**
- connection banners / touch harden → phase 4
- thermal print polish → phase 4 optional / later
- food-cost % deep analytics → later
- reversing stock when an order is cancelled after deduct → phase 4 candidate
- multi-tenant / other customers packaging → later

---

## 9) prompt for teammate after pull

```text
pull latest main. read PHASE-3-HANDOFF.md and PHASE-4-HANDOFF.md.
confirm phase3.sql was run on the shared supabase.
phase 3 is done. start phase 4 offline/harden as described in PHASE-4-HANDOFF.md.
do not break online pos/kds/admin or reuse client_id for something else.
```
