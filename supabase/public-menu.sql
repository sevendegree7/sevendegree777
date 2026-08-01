-- public qr menu: guests can read available menu without login
-- run in supabase sql editor (safe to re-run)

drop policy if exists "categories_select_anon" on public.categories;
drop policy if exists "products_select_anon" on public.products;
drop policy if exists "modifiers_select_anon" on public.modifiers;

-- anyone (including qr guests) can read the menu
create policy "categories_select_anon"
on public.categories for select
to anon
using (true);

create policy "products_select_anon"
on public.products for select
to anon
using (true);

create policy "modifiers_select_anon"
on public.modifiers for select
to anon
using (true);
