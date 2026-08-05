# phase 5 handoff: launch hardening, brand, and the four-tab menu

everything in this document was built after the phase 4 merge (`1f0114a`). the
system is deployed, both earlier migrations are applied to the live project, and
a dry run has already put real sales through it.

## 1. the six gaps from the client review

### stock comes back on a late cancel

order history on the till now does three things: reprint, cancel, and edit.

cancel works on a completed sale, not just a pending one, and returns the stock
in the same transaction that marks the order cancelled. edit is not an in-place
change: it creates the corrected sale, cancels the original, and returns the
original's stock exactly once. both papers show which ticket was replaced, so
the customer and the baker can tell which one is live.

the "exactly once" matters. `return_stock_for_order` is guarded so a double tap
or a retried request cannot put the same pieces back twice.

### ticket numbers are 1, 2, 3 and reset at midnight

visible tickets are `1..n` per Egyptian calendar day, held in
`daily_ticket_counters`. the internal primary key is still a uuid, which is what
makes offline dedup work.

the offline case is the reason this was hard: a sale rung with no internet
reserves its date and number **at sync time**, not at ring time. that means the
number the customer was told is the number that lands in the database, and it
does not shuffle when three tablets sync at once.

### two thermal copies, and what is on each

every completed sale opens a printable receipt. two-copy mode is the default and
prints two separate 80mm pages.

- **customer copy**: order number in 60px at the top between two rules, the way
  a fast food screen shows it. then time, order type, payment, the items with
  prices, the total, and the thank you line.
- **baker copy**: same order number at the same size, time, order type, and the
  items only. no unit prices, no total, no payment method. quantities and any
  extras or notes are set heavier than on the customer copy, because a missed
  "2 ×" is the mistake that paper exists to prevent.

browser print is finished and correct. silent ESC/POS still needs the hardware.

### KDS can be switched off

`/admin/settings` has a KDS toggle. with it off, new sales are created already
completed and `/kds` shows an off message instead of an empty board. that is the
cashier-only mode for launch, where bakes arrive ready.

### admin manages staff, reports filter by cashier

`/admin/users` creates and enables/disables `admin`, `cashier` and `kitchen`
accounts. every order records `created_by`, and `/admin/reports` filters on it,
so the owner can see each cashier's own numbers.

### inventory counts finished pieces, not flour

`/admin/settings` switches between finished-goods and ingredient/BOM mode. in
finished-goods mode you receive ready bakes into vitrine stock, sales deduct
pieces, cancels restore pieces, and finished-product waste deducts pieces
without touching revenue. the BOM engine is still there for when baking moves
in-house.

## 2. the brand

the brand book (`7degree-brand-presentation.pdf`, committed) is now the UI
source of truth.

- **tokens**: midnight navy `#0E1B2C`, cream `#FBF8EF`, saffron `#D4A24A`, plus
  one colour per cuisine. all in `globals.css` as CSS variables.
- **fonts**: Fraunces (display), Cormorant Garamond italic (accent), IBM Plex
  Sans (body), IBM Plex Sans Arabic, IBM Plex Mono (labels and money). all self
  hosted, so a truck with no internet still renders in the right type.
- **theme**: follows the device by default. light, dark and system override live
  in the top-right account menu, and on a gear on the login page. an inline
  script sets the theme before first paint, so the tablet never flashes cream
  then snaps to navy.
- **arabic**: till and login only, with full RTL mirroring. the kitchen board and
  admin stay English. server messages still come back in English.
- the `7°` mark is a typographic stand-in. the designer still owes an svg.

## 3. the menu, restructured

the seven fusions are still the range, but they are no longer seven categories.
customers and cashiers both get four: **desserts, extras, boxes, beverages**.

the cuisine colour was not thrown away. it moved off the category and onto the
product (`products.color`), so a dessert card on the till still wears roma red
or tokyo blue even though the tab above it says "desserts".

- **till**: four tabs. a category is only shown if it is active and has
  something on sale, which is what finally hides the four dead bakery tabs.
- **public QR menu**: the same four as scrollable tabs. the extras tab is one
  flat price list of add-ons, deduplicated, rather than repeating "extra
  pistachio" under all seven desserts.
- **beverages**: the category exists and is empty on purpose. the old drinks were
  retired with the bakery menu. add real ones in admin and the tab appears by
  itself.
- **extras**: stays as `modifiers`, but is reusable now. admin creates "extra
  chocolate" once with one price and every active extra appears on every item.
  old product-owned extras are promoted to the shared list by the migration.
  deactivating one hides it without breaking old receipts or ingredient recipes.

## 4. production database

apply through the versioned migrations in `supabase/migrations/`:

| migration | state |
| --- | --- |
| `20260805130000_launch_hardening.sql` | applied |
| `20260805150000_seven_fusions_menu.sql` | applied |
| `20260805170000_menu_four_categories.sql` | applied |
| `20260805190000_global_extras.sql` | applied |

```bash
npx supabase db push
```

`launch_hardening` adds the daily ticket counter, settings, finished-product
stock, finished-product waste, account activation, stock return, and mode-aware
stock functions. it also removes the unsafe policy that let a staff member
update their own role.

`seven_fusions_menu` retires the placeholder bakery products and seeds the
fusion desserts and box formats. prices are the deck's and are temporary until
the client signs them off. changing one is an admin edit, not a migration.

`menu_four_categories` adds `categories.is_active` and `products.color`, copies
each cuisine colour down onto its products, collapses the seven cuisines into
`desserts`, and deactivates every category outside the four. nothing is deleted,
because retired products and real past orders still point at the old rows.

`global_extras` makes `modifiers.product_id` nullable and adds
`modifiers.is_active`. null means the extra is shared by the whole menu. old
extras are made global, while checkout still understands a non-null product id
for a future product-only option. order items already snapshot the chosen name
and price, so old receipts do not change.

## 5. required environment

local and Vercel both need:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

the service-role key is server-only. never expose it with `NEXT_PUBLIC_`.

## 6. verification

run locally on every change:

```bash
npm run lint
npm test      # 79 passing
npm run build
```

there is also a read-only check against the live project, which selects and
never writes, so it is safe to run while the truck is trading:

```bash
node --env-file=.env.local scripts/verify-launch.mjs
```

it confirms the settings row, the live and retired product counts, category
colours, stock rows, today's ticket counter, and the staff accounts. last run
passed with KDS off, finished-goods mode, two copies, 10 live products, 18 stock
rows and 3 active accounts.

after applying the latest migrations, check by hand:

1. the till shows exactly four tabs, and no tab is empty.
2. a dessert card still shows its cuisine colour on the leading edge.
3. the QR menu opens on desserts and the extras tab is one flat price list.
4. ring a sale and confirm two papers: order number large on both, prices on the
   first only.
5. cancel that sale from history and confirm the pieces come back.
6. create "extra chocolate" in `/admin/menu`, then tap two different products
   on the till and confirm it appears on both at the same price.
7. turn that extra off in admin, refresh the till menu, and confirm it disappears
   from the till and the QR extras tab while old receipts still show it.

## 7. what is still open

- **printer**: browser print is done. silent direct ESC/POS needs the model and
  the connection type (USB, ethernet/Wi-Fi, Bluetooth, or Android print
  service). paper width, cut behaviour, Arabic rendering and the cash-drawer
  pulse all have to be tested on the real unit.
- **logo**: the real engraved `7°` as svg or transparent png.
- **prices**: still the deck's numbers, not signed off.
- **beverages**: empty until drinks are decided.
- launch chores: touch QA on the Lenovo, owner acceptance, staff training, and a
  written end-of-day and backup procedure.
- optional after launch: refunds and payment reversals, shift open/close cash
  reconciliation, CSV export, and food-cost versus net-profit analytics.
