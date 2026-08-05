-- reusable extras, available on every product.
--
-- modifiers used to belong to one product. that made "extra chocolate" seven
-- different rows if seven desserts could take it, and changing its price meant
-- finding every copy. an extra is now one menu record with one price. a null
-- product_id means global, while a non-null value stays supported so old data
-- and any future product-only option keep their meaning.
--
-- old extras become global because that is the requested operating model.
-- order_items already snapshot the chosen name and price, so this does not
-- rewrite a receipt that has already been printed. duplicate names are folded
-- into one row so admin does not see "extra chocolate" three times.

alter table public.modifiers
  alter column product_id drop not null;

alter table public.modifiers
  add column if not exists is_active boolean not null default true;

update public.modifiers
set product_id = null;

-- keep the oldest row for each name. later copies lose their recipes and are
-- removed, because the till and admin only need one price for that extra.
with ranked as (
  select
    id,
    lower(name) as name_key,
    row_number() over (
      partition by lower(name)
      order by created_at asc, id asc
    ) as keep_rank
  from public.modifiers
),
keepers as (
  select id, name_key from ranked where keep_rank = 1
),
duplicates as (
  select ranked.id as duplicate_id, keepers.id as keeper_id
  from ranked
  join keepers on keepers.name_key = ranked.name_key
  where ranked.keep_rank > 1
)
update public.modifier_recipes mr
set modifier_id = duplicates.keeper_id
from duplicates
where mr.modifier_id = duplicates.duplicate_id
  and not exists (
    select 1
    from public.modifier_recipes existing
    where existing.modifier_id = duplicates.keeper_id
      and existing.inventory_item_id = mr.inventory_item_id
  );

with ranked as (
  select
    id,
    lower(name) as name_key,
    row_number() over (
      partition by lower(name)
      order by created_at asc, id asc
    ) as keep_rank
  from public.modifiers
),
keepers as (
  select id, name_key from ranked where keep_rank = 1
),
duplicates as (
  select ranked.id as duplicate_id, keepers.id as keeper_id
  from ranked
  join keepers on keepers.name_key = ranked.name_key
  where ranked.keep_rank > 1
)
delete from public.modifier_recipes mr
using duplicates
where mr.modifier_id = duplicates.duplicate_id;

with ranked as (
  select
    id,
    row_number() over (
      partition by lower(name)
      order by created_at asc, id asc
    ) as keep_rank
  from public.modifiers
)
delete from public.modifiers
where id in (
  select id from ranked where keep_rank > 1
);

comment on column public.modifiers.product_id is
  'null for a global extra; product id for a product-only option';

comment on column public.modifiers.is_active is
  'inactive extras stay for old receipts and recipes but disappear from the till';

-- qr guests only need extras that can currently be ordered. authenticated staff
-- retain the existing read policy, including inactive rows needed by admin.
drop policy if exists "modifiers_select_anon" on public.modifiers;
create policy "modifiers_select_anon"
on public.modifiers for select
to anon
using (is_active = true);
