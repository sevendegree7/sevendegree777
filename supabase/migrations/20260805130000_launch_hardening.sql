-- launch hardening: staff controls, daily tickets, operating mode and stock safety
-- forward-only migration for the already-running shared / production database

-- staff accounts can be disabled without deleting their sales history
alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- one row controls how this truck operates today
create table if not exists public.app_settings (
  id text primary key,
  kds_enabled boolean not null default false,
  inventory_mode text not null default 'finished_goods'
    check (inventory_mode in ('finished_goods', 'ingredients')),
  receipt_copies smallint not null default 2
    check (receipt_copies between 1 and 3),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, kds_enabled, inventory_mode, receipt_copies)
values ('global', false, 'finished_goods', 2)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_staff" on public.app_settings;
drop policy if exists "app_settings_write_admin" on public.app_settings;

create policy "app_settings_select_staff"
on public.app_settings for select to authenticated
using (public.current_user_role() in ('admin', 'cashier', 'kitchen'));

create policy "app_settings_write_admin"
on public.app_settings for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- a staff member must not be able to update their own role to admin
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

create policy "profiles_update_admin"
on public.profiles for update to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- products are received ready-made for the vitrine, so stock can be tracked
-- by finished unit instead of always pulling raw recipe ingredients
create table if not exists public.product_stock (
  product_id uuid primary key references public.products (id) on delete cascade,
  current_stock numeric(12, 3) not null default 0,
  min_threshold numeric(12, 3) not null default 0 check (min_threshold >= 0),
  updated_at timestamptz not null default now()
);

insert into public.product_stock (product_id)
select p.id
from public.products p
on conflict (product_id) do nothing;

alter table public.product_stock enable row level security;

drop policy if exists "product_stock_select_staff" on public.product_stock;
drop policy if exists "product_stock_write_admin" on public.product_stock;

create policy "product_stock_select_staff"
on public.product_stock for select to authenticated
using (public.current_user_role() in ('admin', 'cashier', 'kitchen'));

create policy "product_stock_write_admin"
on public.product_stock for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create or replace function public.receive_product_stock(
  p_product_id uuid,
  p_add_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'message', 'admin only');
  end if;

  if p_add_quantity is null or p_add_quantity <= 0 then
    return jsonb_build_object('ok', false, 'message', 'quantity must be positive');
  end if;

  insert into public.product_stock (product_id, current_stock, updated_at)
  values (p_product_id, p_add_quantity, now())
  on conflict (product_id) do update
  set current_stock = public.product_stock.current_stock + excluded.current_stock,
      updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.receive_product_stock(uuid, numeric)
to authenticated;

create or replace function public.set_product_stock_threshold(
  p_product_id uuid,
  p_min_threshold numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'message', 'admin only');
  end if;

  if p_min_threshold is null or p_min_threshold < 0 then
    return jsonb_build_object('ok', false, 'message', 'threshold must be zero or more');
  end if;

  insert into public.product_stock (product_id, min_threshold, updated_at)
  values (p_product_id, p_min_threshold, now())
  on conflict (product_id) do update
  set min_threshold = excluded.min_threshold,
      updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_product_stock_threshold(uuid, numeric)
to authenticated;

-- visible ticket numbers reset at midnight in Africa/Cairo.
-- uuid remains the internal primary key; staff/customers see ticket_number.
alter table public.orders
  add column if not exists ticket_date date,
  add column if not exists ticket_number integer;

with ranked as (
  select
    id,
    (created_at at time zone 'Africa/Cairo')::date as business_date,
    row_number() over (
      partition by (created_at at time zone 'Africa/Cairo')::date
      order by created_at, id
    )::integer as number
  from public.orders
  where ticket_date is null or ticket_number is null
)
update public.orders o
set ticket_date = ranked.business_date,
    ticket_number = ranked.number
from ranked
where o.id = ranked.id;

alter table public.orders
  alter column ticket_date set not null,
  alter column ticket_number set not null;

create unique index if not exists orders_ticket_date_number_idx
on public.orders (ticket_date, ticket_number);

create table if not exists public.daily_ticket_counters (
  business_date date primary key,
  next_number integer not null check (next_number > 0)
);

insert into public.daily_ticket_counters (business_date, next_number)
select ticket_date, max(ticket_number) + 1
from public.orders
group by ticket_date
on conflict (business_date) do update
set next_number = greatest(
  public.daily_ticket_counters.next_number,
  excluded.next_number
);

alter table public.daily_ticket_counters enable row level security;

-- no direct policies: callers use this checked function
create or replace function public.allocate_ticket_number(
  p_ticket_date date default (now() at time zone 'Africa/Cairo')::date,
  p_requested_number integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  if public.current_user_role() not in ('admin', 'cashier') then
    raise exception 'this account cannot allocate ticket numbers';
  end if;

  if p_requested_number is not null then
    if p_requested_number < 1 then
      raise exception 'ticket number must be positive';
    end if;

    insert into public.daily_ticket_counters (business_date, next_number)
    values (p_ticket_date, p_requested_number + 1)
    on conflict (business_date) do update
    set next_number = greatest(
      public.daily_ticket_counters.next_number,
      excluded.next_number
    );

    return p_requested_number;
  end if;

  insert into public.daily_ticket_counters (business_date, next_number)
  values (p_ticket_date, 2)
  on conflict (business_date) do update
  set next_number = public.daily_ticket_counters.next_number + 1
  returning next_number - 1 into v_number;

  return v_number;
end;
$$;

grant execute on function public.allocate_ticket_number(date, integer)
to authenticated;

-- pull either finished products or recipe ingredients, based on admin setting
create or replace function public.deduct_stock_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already boolean;
  v_mode text;
  v_line record;
  v_mod jsonb;
  v_mod_id uuid;
  v_need numeric(12, 3);
  v_item_id uuid;
  v_changes integer := 0;
begin
  select stock_deducted into v_already
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'order not found');
  end if;

  if v_already then
    return jsonb_build_object('ok', true, 'message', 'already deducted', 'changes', 0);
  end if;

  if exists (
    select 1 from public.orders where id = p_order_id and status = 'cancelled'
  ) then
    return jsonb_build_object('ok', true, 'message', 'order cancelled, no deduct', 'changes', 0);
  end if;

  select inventory_mode into v_mode
  from public.app_settings
  where id = 'global';

  v_mode := coalesce(v_mode, 'finished_goods');

  for v_line in
    select product_id, quantity, selected_modifiers
    from public.order_items
    where order_id = p_order_id
  loop
    if v_line.product_id is null then
      continue;
    end if;

    if v_mode = 'finished_goods' then
      insert into public.product_stock (product_id, current_stock, updated_at)
      values (v_line.product_id, -v_line.quantity, now())
      on conflict (product_id) do update
      set current_stock = public.product_stock.current_stock - v_line.quantity,
          updated_at = now();
      v_changes := v_changes + 1;
      continue;
    end if;

    for v_item_id, v_need in
      select r.inventory_item_id, r.quantity_required * v_line.quantity
      from public.recipes r
      where r.product_id = v_line.product_id
    loop
      update public.inventory_items
      set current_stock = current_stock - v_need
      where id = v_item_id;
      v_changes := v_changes + 1;
    end loop;

    if v_line.selected_modifiers is not null then
      for v_mod in
        select * from jsonb_array_elements(v_line.selected_modifiers)
      loop
        begin
          v_mod_id := (v_mod ->> 'id')::uuid;
        exception when others then
          continue;
        end;

        for v_item_id, v_need in
          select mr.inventory_item_id, mr.quantity_required * v_line.quantity
          from public.modifier_recipes mr
          where mr.modifier_id = v_mod_id
        loop
          update public.inventory_items
          set current_stock = current_stock - v_need
          where id = v_item_id;
          v_changes := v_changes + 1;
        end loop;
      end loop;
    end if;
  end loop;

  update public.orders
  set stock_deducted = true
  where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'deducted',
    'mode', v_mode,
    'changes', v_changes
  );
end;
$$;

grant execute on function public.deduct_stock_for_order(uuid)
to authenticated;

-- idempotent mirror of deduct_stock_for_order
create or replace function public.return_stock_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deducted boolean;
  v_status public.order_status;
  v_mode text;
  v_line record;
  v_mod jsonb;
  v_mod_id uuid;
  v_need numeric(12, 3);
  v_item_id uuid;
  v_changes integer := 0;
begin
  select stock_deducted, status into v_deducted, v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'order not found');
  end if;

  if v_status <> 'cancelled' then
    return jsonb_build_object('ok', false, 'message', 'order is not cancelled');
  end if;

  if not v_deducted then
    return jsonb_build_object('ok', true, 'message', 'nothing to return', 'changes', 0);
  end if;

  select inventory_mode into v_mode
  from public.app_settings
  where id = 'global';

  v_mode := coalesce(v_mode, 'finished_goods');

  for v_line in
    select product_id, quantity, selected_modifiers
    from public.order_items
    where order_id = p_order_id
  loop
    if v_line.product_id is null then
      continue;
    end if;

    if v_mode = 'finished_goods' then
      insert into public.product_stock (product_id, current_stock, updated_at)
      values (v_line.product_id, v_line.quantity, now())
      on conflict (product_id) do update
      set current_stock = public.product_stock.current_stock + v_line.quantity,
          updated_at = now();
      v_changes := v_changes + 1;
      continue;
    end if;

    for v_item_id, v_need in
      select r.inventory_item_id, r.quantity_required * v_line.quantity
      from public.recipes r
      where r.product_id = v_line.product_id
    loop
      update public.inventory_items
      set current_stock = current_stock + v_need
      where id = v_item_id;
      v_changes := v_changes + 1;
    end loop;

    if v_line.selected_modifiers is not null then
      for v_mod in
        select * from jsonb_array_elements(v_line.selected_modifiers)
      loop
        begin
          v_mod_id := (v_mod ->> 'id')::uuid;
        exception when others then
          continue;
        end;

        for v_item_id, v_need in
          select mr.inventory_item_id, mr.quantity_required * v_line.quantity
          from public.modifier_recipes mr
          where mr.modifier_id = v_mod_id
        loop
          update public.inventory_items
          set current_stock = current_stock + v_need
          where id = v_item_id;
          v_changes := v_changes + 1;
        end loop;
      end loop;
    end if;
  end loop;

  update public.orders
  set stock_deducted = false
  where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'returned',
    'mode', v_mode,
    'changes', v_changes
  );
end;
$$;

grant execute on function public.return_stock_for_order(uuid)
to authenticated;

create table if not exists public.product_waste_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  quantity numeric(12, 3) not null check (quantity > 0),
  reason public.waste_reason not null,
  notes text,
  logged_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.product_waste_logs enable row level security;

drop policy if exists "product_waste_select_admin" on public.product_waste_logs;
drop policy if exists "product_waste_insert_admin" on public.product_waste_logs;

create policy "product_waste_select_admin"
on public.product_waste_logs for select to authenticated
using (public.current_user_role() = 'admin');

create policy "product_waste_insert_admin"
on public.product_waste_logs for insert to authenticated
with check (public.current_user_role() = 'admin');

create or replace function public.log_product_waste_and_deduct(
  p_product_id uuid,
  p_quantity numeric,
  p_reason public.waste_reason,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'message', 'admin only');
  end if;

  if p_quantity is null or p_quantity <= 0 then
    return jsonb_build_object('ok', false, 'message', 'quantity must be positive');
  end if;

  insert into public.product_stock (product_id, current_stock, updated_at)
  values (p_product_id, -p_quantity, now())
  on conflict (product_id) do update
  set current_stock = public.product_stock.current_stock - p_quantity,
      updated_at = now();

  insert into public.product_waste_logs (
    product_id,
    quantity,
    reason,
    notes,
    logged_by
  )
  values (p_product_id, p_quantity, p_reason, p_notes, auth.uid());

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.log_product_waste_and_deduct(
  uuid,
  numeric,
  public.waste_reason,
  text
) to authenticated;
