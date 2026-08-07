-- tax on the receipt, controlled by admin.
--
-- two halves, and the split matters:
--
--   app_settings holds the LIVE rule - what to charge on the next sale.
--   orders hold the SNAPSHOT - what was actually charged on this one.
--
-- the same reason order_items.product_name is a copy rather than a join. the
-- owner is going to change this rate at some point, and when they do, every
-- receipt already in a customer's hand must still re-print the number that was
-- taken off them. a receipt that quietly re-prices itself is not a receipt.

-- ---------------------------------------------------------------------------
-- the live rule
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists tax_enabled boolean not null default false,
  add column if not exists tax_label text not null default 'VAT',
  add column if not exists tax_rate numeric(5,2) not null default 0,
  add column if not exists tax_mode text not null default 'added';

comment on column public.app_settings.tax_enabled is
  'off by default. turning this on changes what customers are charged, so it is never on until somebody decides it is.';
comment on column public.app_settings.tax_label is
  'what the line is called on the paper - VAT, ضريبة, service. printed as typed.';
comment on column public.app_settings.tax_rate is
  'percent, not a fraction. 14 means 14%.';
comment on column public.app_settings.tax_mode is
  'added: menu prices are before tax and it goes on top. included: menu prices already contain it and the receipt only shows the split.';

-- a rate outside this is a typo, and a typo here overcharges a customer
alter table public.app_settings
  drop constraint if exists app_settings_tax_rate_range;
alter table public.app_settings
  add constraint app_settings_tax_rate_range
  check (tax_rate >= 0 and tax_rate <= 100);

alter table public.app_settings
  drop constraint if exists app_settings_tax_mode_known;
alter table public.app_settings
  add constraint app_settings_tax_mode_known
  check (tax_mode in ('added', 'included'));

-- an empty label would print a bare number with nothing naming it
alter table public.app_settings
  drop constraint if exists app_settings_tax_label_present;
alter table public.app_settings
  add constraint app_settings_tax_label_present
  check (length(btrim(tax_label)) > 0);

-- ---------------------------------------------------------------------------
-- the snapshot
-- ---------------------------------------------------------------------------

-- total_amount is untouched and keeps its meaning: what the customer paid.
-- every report, every shift count and every drawer reconciliation already sums
-- that column, and they must all keep working without knowing tax exists.
alter table public.orders
  add column if not exists subtotal_amount numeric(12,2),
  add column if not exists tax_amount numeric(12,2),
  add column if not exists tax_rate numeric(5,2),
  add column if not exists tax_label text;

comment on column public.orders.subtotal_amount is
  'the lines added up, before tax. total_amount minus tax_amount.';
comment on column public.orders.tax_amount is
  'tax actually charged on this sale, in pounds. 0 when tax was off at the time.';
comment on column public.orders.tax_rate is
  'the percent in force when this sale was rung. kept so an old receipt can name its own rate.';
comment on column public.orders.tax_label is
  'what the tax was called when this sale was rung.';

-- every sale before this migration was rung with no tax, so its subtotal is
-- its total. filling these in rather than leaving them null means a report can
-- sum subtotal_amount across the whole table without a coalesce.
update public.orders
set subtotal_amount = total_amount,
    tax_amount = 0
where subtotal_amount is null;
