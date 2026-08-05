-- dunkin-style boxes: a pack size plus the category of flavors inside.
--
-- a normal product has piece_count null. a box of six desserts has
-- piece_count = 6 and contents_category_id pointing at desserts. the cashier
-- must pick six flavors at the till; finished-goods stock then deducts those
-- flavor pieces, not the box sku itself, because the box is assembled from
-- the vitrine.

alter table public.products
  add column if not exists piece_count integer;

alter table public.products
  add column if not exists contents_category_id uuid
    references public.categories (id) on delete set null;

alter table public.products
  drop constraint if exists products_box_fields_check;

alter table public.products
  add constraint products_box_fields_check
  check (
    (
      piece_count is null
      and contents_category_id is null
    )
    or (
      piece_count is not null
      and piece_count > 0
      and contents_category_id is not null
    )
  );

-- flavors chosen for a box line. separate from selected_modifiers so extras
-- and composition never get mixed on the receipt or in stock math.
alter table public.order_items
  add column if not exists box_contents jsonb not null default '[]'::jsonb;

-- existing box products from the seven fusions seed
update public.products p
set
  piece_count = v.piece_count,
  contents_category_id = (
    select id from public.categories where name = 'desserts' limit 1
  )
from (
  values
    ('small box · 6', 6),
    ('the seven · box', 7),
    ('large bento · 24', 24)
) as v (name, piece_count)
where p.name = v.name
  and p.piece_count is null
  and exists (select 1 from public.categories where name = 'desserts');

comment on column public.products.piece_count is
  'null for a normal item; pack size for a dunkin-style box';

comment on column public.products.contents_category_id is
  'category the cashier picks flavors from when selling a box';

comment on column public.order_items.box_contents is
  'json array of {id, name, quantity} flavors packed into this box line';

-- finished-goods deduct: boxes burn flavor pieces; plain items burn themselves
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
  v_piece jsonb;
  v_piece_id uuid;
  v_piece_qty integer;
  v_need numeric(12, 3);
  v_item_id uuid;
  v_changes integer := 0;
  v_is_box boolean;
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
    select
      oi.product_id,
      oi.quantity,
      oi.selected_modifiers,
      oi.box_contents,
      p.piece_count
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  loop
    if v_line.product_id is null then
      continue;
    end if;

    v_is_box := v_line.piece_count is not null and v_line.piece_count > 0;

    if v_mode = 'finished_goods' then
      if v_is_box then
        for v_piece in
          select * from jsonb_array_elements(coalesce(v_line.box_contents, '[]'::jsonb))
        loop
          begin
            v_piece_id := (v_piece ->> 'id')::uuid;
            v_piece_qty := greatest(1, coalesce((v_piece ->> 'quantity')::integer, 1));
          exception when others then
            continue;
          end;

          insert into public.product_stock (product_id, current_stock, updated_at)
          values (
            v_piece_id,
            -(v_piece_qty * v_line.quantity),
            now()
          )
          on conflict (product_id) do update
          set current_stock =
                public.product_stock.current_stock
                - (v_piece_qty * v_line.quantity),
              updated_at = now();
          v_changes := v_changes + 1;
        end loop;
      else
        insert into public.product_stock (product_id, current_stock, updated_at)
        values (v_line.product_id, -v_line.quantity, now())
        on conflict (product_id) do update
        set current_stock = public.product_stock.current_stock - v_line.quantity,
            updated_at = now();
        v_changes := v_changes + 1;
      end if;

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
  v_piece jsonb;
  v_piece_id uuid;
  v_piece_qty integer;
  v_need numeric(12, 3);
  v_item_id uuid;
  v_changes integer := 0;
  v_is_box boolean;
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
    select
      oi.product_id,
      oi.quantity,
      oi.selected_modifiers,
      oi.box_contents,
      p.piece_count
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  loop
    if v_line.product_id is null then
      continue;
    end if;

    v_is_box := v_line.piece_count is not null and v_line.piece_count > 0;

    if v_mode = 'finished_goods' then
      if v_is_box then
        for v_piece in
          select * from jsonb_array_elements(coalesce(v_line.box_contents, '[]'::jsonb))
        loop
          begin
            v_piece_id := (v_piece ->> 'id')::uuid;
            v_piece_qty := greatest(1, coalesce((v_piece ->> 'quantity')::integer, 1));
          exception when others then
            continue;
          end;

          insert into public.product_stock (product_id, current_stock, updated_at)
          values (
            v_piece_id,
            v_piece_qty * v_line.quantity,
            now()
          )
          on conflict (product_id) do update
          set current_stock =
                public.product_stock.current_stock
                + (v_piece_qty * v_line.quantity),
              updated_at = now();
          v_changes := v_changes + 1;
        end loop;
      else
        insert into public.product_stock (product_id, current_stock, updated_at)
        values (v_line.product_id, v_line.quantity, now())
        on conflict (product_id) do update
        set current_stock = public.product_stock.current_stock + v_line.quantity,
            updated_at = now();
        v_changes := v_changes + 1;
      end if;

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
