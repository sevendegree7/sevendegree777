-- clear the demo bakery inventory that was seeded with fixed uuids.
--
-- those rows (flour, nutella, classic cinnabon stock, etc.) came from
-- phase3-seed.sql during early dry runs. the truck now runs finished-goods
-- mode on the seven fusions, so the old ingredient list and retired product
-- stock rows only clutter admin.
--
-- nothing live depends on them: finished-goods deducts product_stock by
-- product_id, and the bakery products are already is_available = false.

-- recipes and waste that still point at the demo ingredients
delete from public.modifier_recipes
where inventory_item_id in (
  select id from public.inventory_items
  where name in (
    'flour',
    'butter',
    'sugar',
    'cinnamon',
    'nutella',
    'chocolate',
    'walnut',
    'coffee',
    'juice base',
    'icing'
  )
);

delete from public.recipes
where inventory_item_id in (
  select id from public.inventory_items
  where name in (
    'flour',
    'butter',
    'sugar',
    'cinnamon',
    'nutella',
    'chocolate',
    'walnut',
    'coffee',
    'juice base',
    'icing'
  )
)
or product_id in (
  select id from public.products where is_available = false
);

delete from public.waste_logs
where inventory_item_id in (
  select id from public.inventory_items
  where name in (
    'flour',
    'butter',
    'sugar',
    'cinnamon',
    'nutella',
    'chocolate',
    'walnut',
    'coffee',
    'juice base',
    'icing'
  )
);

delete from public.inventory_items
where name in (
  'flour',
  'butter',
  'sugar',
  'cinnamon',
  'nutella',
  'chocolate',
  'walnut',
  'coffee',
  'juice base',
  'icing'
);

-- vitrine rows for products that are no longer on sale
delete from public.product_stock ps
using public.products p
where ps.product_id = p.id
  and p.is_available = false;

-- box skus are packed from flavors; their own stock row is unused noise
delete from public.product_stock ps
using public.products p
where ps.product_id = p.id
  and p.piece_count is not null;
