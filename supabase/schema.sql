-- seven degree pos - phase 1 core schema
-- run this in supabase: sql editor -> new query -> paste -> run

-- roles for login redirect
create type public.user_role as enum ('admin', 'cashier', 'kitchen');

-- how the customer paid
create type public.payment_method as enum ('cash', 'card', 'instapay');

-- where the order came from
create type public.order_type as enum ('takeaway', 'dine_in', 'talabat');

-- kitchen pipeline status
create type public.order_status as enum (
  'pending',
  'preparing',
  'ready',
  'completed',
  'cancelled'
);

-- staff profile linked to supabase auth user
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role public.user_role not null default 'cashier',
  created_at timestamptz not null default now()
);

-- menu groups like brownies / cinnabon
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- sellable items
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  base_price numeric(10, 2) not null check (base_price >= 0),
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- add-ons or removals for a product
create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  extra_price numeric(10, 2) not null default 0 check (extra_price >= 0),
  created_at timestamptz not null default now()
);

-- one customer ticket
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- used later for offline sync so we do not double-upload
  client_id text unique,
  total_amount numeric(10, 2) not null default 0 check (total_amount >= 0),
  payment_method public.payment_method,
  order_type public.order_type not null default 'takeaway',
  status public.order_status not null default 'pending',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- lines inside an order
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity int not null default 1 check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  -- json list of chosen modifiers for the kitchen
  selected_modifiers jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- keep updated_at fresh on order changes
create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_set_updated_at
before update on public.orders
for each row
execute function public.set_orders_updated_at();

-- indexes for common reads
create index orders_status_created_at_idx on public.orders (status, created_at desc);
create index products_category_id_idx on public.products (category_id);
create index modifiers_product_id_idx on public.modifiers (product_id);
create index order_items_order_id_idx on public.order_items (order_id);

-- turn on row level security
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.modifiers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- helper: read current user role
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- profiles: user can read own row; admin can read all
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'admin'
);

create policy "profiles_update_own_or_admin"
on public.profiles for update
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'admin'
)
with check (
  id = auth.uid()
  or public.current_user_role() = 'admin'
);

-- menu tables: any logged in staff can read
create policy "categories_select_authenticated"
on public.categories for select to authenticated using (true);

create policy "products_select_authenticated"
on public.products for select to authenticated using (true);

create policy "modifiers_select_authenticated"
on public.modifiers for select to authenticated using (true);

-- only admin changes menu in phase 1
create policy "categories_write_admin"
on public.categories for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "products_write_admin"
on public.products for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "modifiers_write_admin"
on public.modifiers for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- orders: staff can read; cashier/admin insert; kitchen/admin/cashier update status
create policy "orders_select_authenticated"
on public.orders for select to authenticated using (true);

create policy "orders_insert_cashier_admin"
on public.orders for insert to authenticated
with check (public.current_user_role() in ('cashier', 'admin'));

create policy "orders_update_staff"
on public.orders for update to authenticated
using (public.current_user_role() in ('cashier', 'kitchen', 'admin'))
with check (public.current_user_role() in ('cashier', 'kitchen', 'admin'));

create policy "order_items_select_authenticated"
on public.order_items for select to authenticated using (true);

create policy "order_items_insert_cashier_admin"
on public.order_items for insert to authenticated
with check (public.current_user_role() in ('cashier', 'admin'));

create policy "order_items_update_staff"
on public.order_items for update to authenticated
using (public.current_user_role() in ('cashier', 'kitchen', 'admin'))
with check (public.current_user_role() in ('cashier', 'kitchen', 'admin'));

-- realtime for kitchen screen later
alter publication supabase_realtime add table public.orders;
