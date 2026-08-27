-- discount, diyafa (hospitality), and agel settle columns
-- depends on 20260826180000_agel_payment_method (enum value committed)

alter table public.orders
  add column if not exists discount_kind text,
  add column if not exists discount_value numeric(12, 2),
  add column if not exists discount_amount numeric(12, 2) not null default 0,
  add column if not exists is_diyafa boolean not null default false,
  add column if not exists diyafa_reason text,
  add column if not exists agel_settled_at timestamptz,
  add column if not exists agel_settled_by uuid references auth.users (id) on delete set null,
  add column if not exists agel_settled_payment_method public.payment_method;

comment on column public.orders.discount_kind is
  'percent or fixed. null when no discount was taken.';
comment on column public.orders.discount_value is
  'what the cashier typed: a percent (10) or an egp amount. the money actually taken off lives in discount_amount.';
comment on column public.orders.discount_amount is
  'egp deducted after tax. snapshotted so a reprint matches the paper.';
comment on column public.orders.is_diyafa is
  'hospitality: whole ticket is free. inventory still deducts.';
comment on column public.orders.diyafa_reason is
  'who / why this ticket was given away. required when is_diyafa.';
comment on column public.orders.agel_settled_at is
  'when an agel debt was collected. null means still owing.';
comment on column public.orders.agel_settled_payment_method is
  'cash/card/instapay used to settle the debt. never agel.';

alter table public.orders
  drop constraint if exists orders_discount_kind_known;
alter table public.orders
  add constraint orders_discount_kind_known
  check (discount_kind is null or discount_kind in ('percent', 'fixed'));

alter table public.orders
  drop constraint if exists orders_discount_amount_nonneg;
alter table public.orders
  add constraint orders_discount_amount_nonneg
  check (discount_amount >= 0);

alter table public.orders
  drop constraint if exists orders_diyafa_has_reason;
alter table public.orders
  add constraint orders_diyafa_has_reason
  check (is_diyafa = false or (diyafa_reason is not null and length(trim(diyafa_reason)) > 0));

alter table public.orders
  drop constraint if exists orders_agel_settle_shape;
alter table public.orders
  add constraint orders_agel_settle_shape
  check (
    (agel_settled_at is null and agel_settled_payment_method is null)
    or (
      agel_settled_at is not null
      and agel_settled_payment_method in ('cash', 'card', 'instapay')
    )
  );

create index if not exists orders_open_agel
  on public.orders (created_at desc)
  where payment_method = 'agel'
    and agel_settled_at is null
    and status is distinct from 'cancelled';
