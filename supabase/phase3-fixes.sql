-- phase 3 fixes - atomic restock + tighter public menu policy
-- run in supabase sql editor AFTER phase3.sql and public-menu.sql
-- safe to re-run

-- restock in one statement so a sale that lands mid-restock is not erased.
-- the old path read current_stock in the browser, added to it, and wrote the
-- result back, which silently dropped any deduct that happened in between.
create or replace function public.restock_inventory_item(
  p_item_id uuid,
  p_add_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock numeric(12, 3);
begin
  if public.current_user_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'message', 'admin only');
  end if;

  if p_add_quantity is null or p_add_quantity <= 0 then
    return jsonb_build_object('ok', false, 'message', 'add a positive quantity');
  end if;

  update public.inventory_items
  set current_stock = current_stock + p_add_quantity
  where id = p_item_id
  returning current_stock into v_stock;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'inventory item not found');
  end if;

  return jsonb_build_object('ok', true, 'current_stock', v_stock);
end;
$$;

grant execute on function public.restock_inventory_item(uuid, numeric) to authenticated;

-- qr guests should only see what is actually on sale. the anon key ships in
-- the browser bundle, so "select all products" meant anyone could read the
-- hidden ones and their prices straight from the api.
drop policy if exists "products_select_anon" on public.products;

create policy "products_select_anon"
on public.products for select
to anon
using (is_available = true);
