-- shop waste PIN on settings, and let cashiers log finished-product waste
-- (the till action still checks the PIN before calling this).

alter table public.app_settings
  add column if not exists waste_pin text;

comment on column public.app_settings.waste_pin is
  'shared PIN cashiers type before logging waste on the till. null/empty = waste blocked until admin sets one.';

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
  -- admin or cashier. the till server action must have checked the shop PIN
  -- before a cashier reaches here; this only gates the role.
  if public.current_user_role() not in ('admin', 'cashier') then
    return jsonb_build_object('ok', false, 'message', 'admin or cashier only');
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
