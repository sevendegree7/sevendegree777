-- soft-archive for "clear all orders": keep the rows, hide them from the till
-- and live reports. stock is still returned by the app before this flag is set.

alter table public.orders
  add column if not exists archived_at timestamptz;

create index if not exists orders_live_created_at
  on public.orders (created_at desc)
  where archived_at is null;

comment on column public.orders.archived_at is
  'set when admin archives/clears orders. null means the sale is still live.';
