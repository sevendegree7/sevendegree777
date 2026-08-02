-- phase 3 - inventory, recipes, waste, stock deduct
-- run this in supabase sql editor AFTER schema.sql + seed.sql
-- safe to re-run parts that use if not exists / or replace

-- why stock left the shelf without a sale
-- wrapped so re-running this file does not abort on the second pass
do $$
begin
  if not exists (select 1 from pg_type where typname = 'waste_reason') then
    create type public.waste_reason as enum (
      'burnt',
      'dropped',
      'expired',
      'spoiled',
      'remake',
      'other'
    );
  end if;
end
$$;

-- raw materials on the truck
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- g = grams, ml = milliliters, pcs = pieces
  unit text not null check (unit in ('g', 'ml', 'pcs')),
  current_stock numeric(12, 3) not null default 0,
  min_threshold numeric(12, 3) not null default 0 check (min_threshold >= 0),
  created_at timestamptz not null default now()
);

-- bill of materials: one product uses these ingredients
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity_required numeric(12, 3) not null check (quantity_required > 0),
  created_at timestamptz not null default now(),
  unique (product_id, inventory_item_id)
);

-- extras can also burn stock (extra nutella, etc)
create table if not exists public.modifier_recipes (
  id uuid primary key default gen_random_uuid(),
  modifier_id uuid not null references public.modifiers (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity_required numeric(12, 3) not null check (quantity_required > 0),
  created_at timestamptz not null default now(),
  unique (modifier_id, inventory_item_id)
);

-- waste / loss that is not a sale
create table if not exists public.waste_logs (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  reason public.waste_reason not null,
  notes text,
  logged_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- so we never deduct the same order twice
alter table public.orders
  add column if not exists stock_deducted boolean not null default false;

create index if not exists inventory_items_name_idx on public.inventory_items (name);
create index if not exists recipes_product_id_idx on public.recipes (product_id);
create index if not exists modifier_recipes_modifier_id_idx on public.modifier_recipes (modifier_id);
create index if not exists waste_logs_created_at_idx on public.waste_logs (created_at desc);

alter table public.inventory_items enable row level security;
alter table public.recipes enable row level security;
alter table public.modifier_recipes enable row level security;
alter table public.waste_logs enable row level security;

-- drop old policies if re-running
drop policy if exists "inventory_select_authenticated" on public.inventory_items;
drop policy if exists "inventory_write_admin" on public.inventory_items;
drop policy if exists "recipes_select_authenticated" on public.recipes;
drop policy if exists "recipes_write_admin" on public.recipes;
drop policy if exists "modifier_recipes_select_authenticated" on public.modifier_recipes;
drop policy if exists "modifier_recipes_write_admin" on public.modifier_recipes;
drop policy if exists "waste_select_admin" on public.waste_logs;
drop policy if exists "waste_insert_admin" on public.waste_logs;

-- staff can read stock (pos may show low stock later); only admin edits
create policy "inventory_select_authenticated"
on public.inventory_items for select to authenticated using (true);

create policy "inventory_write_admin"
on public.inventory_items for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "recipes_select_authenticated"
on public.recipes for select to authenticated using (true);

create policy "recipes_write_admin"
on public.recipes for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "modifier_recipes_select_authenticated"
on public.modifier_recipes for select to authenticated using (true);

create policy "modifier_recipes_write_admin"
on public.modifier_recipes for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- waste is admin-only for now
create policy "waste_select_admin"
on public.waste_logs for select to authenticated
using (public.current_user_role() = 'admin');

create policy "waste_insert_admin"
on public.waste_logs for insert to authenticated
with check (public.current_user_role() = 'admin');

-- deduct stock once when an order is paid/created
-- allows negative stock so a rush sale never fails
create or replace function public.deduct_stock_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already boolean;
  v_line record;
  v_mod jsonb;
  v_mod_id uuid;
  v_need numeric(12, 3);
  v_item_id uuid;
  v_changes int := 0;
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

  -- skip cancelled tickets
  if exists (
    select 1 from public.orders where id = p_order_id and status = 'cancelled'
  ) then
    return jsonb_build_object('ok', true, 'message', 'order cancelled, no deduct', 'changes', 0);
  end if;

  for v_line in
    select product_id, quantity, selected_modifiers
    from public.order_items
    where order_id = p_order_id
  loop
    if v_line.product_id is not null then
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
    end if;

    -- modifiers on the line (json array)
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

  return jsonb_build_object('ok', true, 'message', 'deducted', 'changes', v_changes);
end;
$$;

grant execute on function public.deduct_stock_for_order(uuid) to authenticated;

-- log waste and pull stock in one step
create or replace function public.log_waste_and_deduct(
  p_inventory_item_id uuid,
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

  if not exists (
    select 1 from public.inventory_items where id = p_inventory_item_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'inventory item not found');
  end if;

  insert into public.waste_logs (
    inventory_item_id,
    quantity,
    reason,
    notes,
    logged_by
  ) values (
    p_inventory_item_id,
    p_quantity,
    p_reason,
    p_notes,
    auth.uid()
  );

  update public.inventory_items
  set current_stock = current_stock - p_quantity
  where id = p_inventory_item_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.log_waste_and_deduct(uuid, numeric, public.waste_reason, text) to authenticated;
