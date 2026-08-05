-- phase 4 sql
-- run this on the supabase project after phase3.sql / phase3-fixes.sql
-- safe to run more than once

-- give the raw materials back when an order is cancelled.
--
-- the mirror of deduct_stock_for_order. phase 3 pulls stock the moment a sale
-- is created and nothing ever put it back, so a cancelled ticket quietly lost
-- the ingredients it never used.
--
-- two guards, and both of them matter:
--
--   - the order has to actually be cancelled. without this, calling it on a
--     live sale would add the ingredients back while the customer still walks
--     away with the food, and the count drifts up every call
--   - stock_deducted has to be true, and it is set back to false in the same
--     transaction. so a double tap, a retry, or two screens cancelling the
--     same ticket can only ever return the stock once
--
-- like the deduct, the arithmetic happens inside postgres
-- (current_stock = current_stock + n), never read-then-write. that race is
-- already logged from the restock bug.
create or replace function public.return_stock_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deducted boolean;
  v_status order_status;
  v_line record;
  v_mod jsonb;
  v_mod_id uuid;
  v_need numeric(12, 3);
  v_item_id uuid;
  v_changes int := 0;
begin
  select stock_deducted, status into v_deducted, v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'order not found');
  end if;

  -- the caller cancels first, then asks for the stock back. an order still on
  -- the board keeps its ingredients.
  if v_status <> 'cancelled' then
    return jsonb_build_object('ok', false, 'message', 'order is not cancelled');
  end if;

  if not v_deducted then
    return jsonb_build_object('ok', true, 'message', 'nothing to return', 'changes', 0);
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
        set current_stock = current_stock + v_need
        where id = v_item_id;
        v_changes := v_changes + 1;
      end loop;
    end if;

    -- modifiers on the line (json array), same shape the deduct reads
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

  -- the same transaction that gave the stock back closes the door behind it
  update public.orders
  set stock_deducted = false
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'returned', 'changes', v_changes);
end;
$$;

grant execute on function public.return_stock_for_order(uuid) to authenticated;
