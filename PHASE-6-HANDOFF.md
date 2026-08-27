# phase 6 handoff: discount, diyafa, agel, and richer reports

everything in this document was built after the shift/tax/void merge (`fc5f004`).
the two migrations below are **applied** to the live supabase project (pasted in
order on 2026-08-27).

## 1. the four client asks

### discount — percent or fixed, after tax

cashiers can type a discount on the till cart panel:

- **percent** (`10` = 10%) or **fixed EGP** (free typing)
- applied **after tax**, not before — see `src/lib/pos/pricing.ts`
- snapshotted on the order: `discount_kind`, `discount_value`, `discount_amount`
- receipt shows the discount line when non-zero

### diyafa (ضيافة) — whole ticket free, stock still moves

diyafa is a **flag on the order**, not a payment method.

- reason required (`diyafa_reason`)
- payable, tax, and discount all zero on the receipt — **total stays 0**
- line items and prices are still snapshotted; inventory still deducts as a normal sale
- columns: `is_diyafa`, `diyafa_reason`

### agel (آجل) — pay later, admin settles

agel is a **payment method** on the till (`payment_method = 'agel'`).

- customer **name required**, phone optional (same fields as named walk-ins)
- order is completed and stock deducts; money is **not** collected at the till
- only **admin** can settle on `/admin/debts` with cash, card, or instapay
- settle columns: `agel_settled_at`, `agel_settled_by`, `agel_settled_payment_method`
- open debts indexed by `orders_open_agel`

cashiers ring agel; they cannot settle. admin-only route and server action.

### reports — tax, filters, jared

`/admin/reports` now includes:

- **tax collected** KPI for the date range (+ discount/diyafa hints in analytics)
- **category** filter and optional **item** multi-select on sales breakdown
- **jared** table: sold qty + finished-goods waste (`product_waste_logs`) per product

jared does **not** yet include ingredient-mode waste (`waste_logs`). finished-goods
mode is the launch default.

## 2. till behaviour (unchanged principles)

- **print failure does not undo the sale** — reprint from history
- **pay double-tap** guarded with a checkout lock ref on the till screen
- **offline** sales carry discount/diyafa/customer fields in the local payload and sync upload
- **agel offline**: allowed like cash/card when online rules permit; debt appears after sync

## 3. production database

apply through the versioned migrations in `supabase/migrations/` **in order**:

| migration | state |
| --- | --- |
| `20260826180000_agel_payment_method.sql` | applied |
| `20260826180100_discount_diyafa_agel.sql` | applied |

the enum add **must** be its own migration before columns/index that reference `agel`.

```bash
npx supabase db push
```

`agel_payment_method` adds `'agel'` to `payment_method`.

`discount_diyafa_agel` adds discount/diyafa/agel-settle columns, checks, and
`orders_open_agel` partial index.

## 4. key files

| area | files |
| --- | --- |
| pricing | `src/lib/pos/pricing.ts`, `pricing.test.ts` |
| till ui | `src/app/pos/components/cart-panel.tsx`, `payment-select.tsx`, `pos-screen.tsx` |
| checkout | `src/app/pos/actions.ts`, `src/lib/pos/cart.ts`, `src/lib/data/local.ts`, `sync.ts` |
| receipt | `src/lib/pos/receipt.ts`, `src/app/pos/components/receipt-view.tsx` |
| admin debts | `src/app/admin/debts/page.tsx`, `settle-form.tsx`, `src/app/admin/actions.ts` |
| reports | `src/app/admin/reports/page.tsx`, `src/lib/reports/analytics.ts`, `jared.ts` |
| types | `src/types/database.types.ts` |
| i18n | `src/lib/i18n/dictionary.ts` (EN + AR cart/payment/receipt/debts) |

## 5. verification

run locally on every change:

```bash
npm run lint
npm test      # 160 passing
npm run build
```

manual checks after deploy:

1. ring a sale with **10% discount after tax** — receipt total matches paper math
2. ring **diyafa** with a reason — total **0**, lines still print, stock drops
3. ring **agel** with a name — appears on `/admin/debts`; settle with cash; debt clears
4. double-tap **Pay** — only one order created
5. `/admin/reports` — tax KPI moves with taxed sales; category/item filter narrows rows; jared shows sold + waste

## 6. what is still open

- **jared ingredient mode**: add `waste_logs` when BOM/inventory mode is primary
- **edit/cancel reset**: discount/diyafa fields may persist if edit is cancelled mid-flow (polish)
- **confirm dialog**: may not preview discount/diyafa before pay (polish)
- everything from phase 5 still open: silent ESC/POS, logo svg, beverage menu, launch QA

## 7. auth reminder

staff roles only (`admin`, `cashier`, `kitchen`). no customer logins on the same
`user_role` enum — see `.cursor/rules/internal-roles-only.mdc`.
