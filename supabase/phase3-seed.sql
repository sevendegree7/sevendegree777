-- sample inventory + recipes for the seeded menu
-- run AFTER phase3.sql and seed.sql
-- uses the fixed product ids from seed.sql

insert into public.inventory_items (id, name, unit, current_stock, min_threshold)
values
  ('33333333-3333-3333-3333-333333333301', 'flour', 'g', 10000, 1000),
  ('33333333-3333-3333-3333-333333333302', 'butter', 'g', 5000, 500),
  ('33333333-3333-3333-3333-333333333303', 'sugar', 'g', 4000, 400),
  ('33333333-3333-3333-3333-333333333304', 'cinnamon', 'g', 800, 100),
  ('33333333-3333-3333-3333-333333333305', 'nutella', 'g', 3000, 300),
  ('33333333-3333-3333-3333-333333333306', 'chocolate', 'g', 2500, 250),
  ('33333333-3333-3333-3333-333333333307', 'walnut', 'g', 1500, 200),
  ('33333333-3333-3333-3333-333333333308', 'coffee', 'g', 2000, 200),
  ('33333333-3333-3333-3333-333333333309', 'juice base', 'ml', 5000, 500),
  ('33333333-3333-3333-3333-333333333310', 'icing', 'g', 2000, 200)
on conflict (id) do nothing;

-- classic cinnabon
insert into public.recipes (product_id, inventory_item_id, quantity_required)
values
  ('22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301', 100),
  ('22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333302', 20),
  ('22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333303', 15),
  ('22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333304', 5)
on conflict (product_id, inventory_item_id) do nothing;

-- nutella cinnabon
insert into public.recipes (product_id, inventory_item_id, quantity_required)
values
  ('22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333301', 100),
  ('22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333302', 20),
  ('22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333305', 30)
on conflict (product_id, inventory_item_id) do nothing;

-- butter croissant
insert into public.recipes (product_id, inventory_item_id, quantity_required)
values
  ('22222222-2222-2222-2222-222222222203', '33333333-3333-3333-3333-333333333301', 80),
  ('22222222-2222-2222-2222-222222222203', '33333333-3333-3333-3333-333333333302', 40)
on conflict (product_id, inventory_item_id) do nothing;

-- chocolate croissant
insert into public.recipes (product_id, inventory_item_id, quantity_required)
values
  ('22222222-2222-2222-2222-222222222204', '33333333-3333-3333-3333-333333333301', 80),
  ('22222222-2222-2222-2222-222222222204', '33333333-3333-3333-3333-333333333302', 35),
  ('22222222-2222-2222-2222-222222222204', '33333333-3333-3333-3333-333333333306', 25)
on conflict (product_id, inventory_item_id) do nothing;

-- classic brownie
insert into public.recipes (product_id, inventory_item_id, quantity_required)
values
  ('22222222-2222-2222-2222-222222222205', '33333333-3333-3333-3333-333333333301', 50),
  ('22222222-2222-2222-2222-222222222205', '33333333-3333-3333-3333-333333333302', 30),
  ('22222222-2222-2222-2222-222222222205', '33333333-3333-3333-3333-333333333306', 40),
  ('22222222-2222-2222-2222-222222222205', '33333333-3333-3333-3333-333333333303', 25)
on conflict (product_id, inventory_item_id) do nothing;

-- walnut brownie
insert into public.recipes (product_id, inventory_item_id, quantity_required)
values
  ('22222222-2222-2222-2222-222222222206', '33333333-3333-3333-3333-333333333301', 50),
  ('22222222-2222-2222-2222-222222222206', '33333333-3333-3333-3333-333333333306', 40),
  ('22222222-2222-2222-2222-222222222206', '33333333-3333-3333-3333-333333333307', 20)
on conflict (product_id, inventory_item_id) do nothing;

-- turkish coffee
insert into public.recipes (product_id, inventory_item_id, quantity_required)
values
  ('22222222-2222-2222-2222-222222222207', '33333333-3333-3333-3333-333333333308', 12)
on conflict (product_id, inventory_item_id) do nothing;

-- fresh juice
insert into public.recipes (product_id, inventory_item_id, quantity_required)
values
  ('22222222-2222-2222-2222-222222222208', '33333333-3333-3333-3333-333333333309', 250)
on conflict (product_id, inventory_item_id) do nothing;

-- modifier recipes (match by name via subquery on seed modifiers)
insert into public.modifier_recipes (modifier_id, inventory_item_id, quantity_required)
select m.id, '33333333-3333-3333-3333-333333333310', 15
from public.modifiers m
where m.name = 'extra icing'
  and m.product_id = '22222222-2222-2222-2222-222222222201'
on conflict (modifier_id, inventory_item_id) do nothing;

insert into public.modifier_recipes (modifier_id, inventory_item_id, quantity_required)
select m.id, '33333333-3333-3333-3333-333333333305', 20
from public.modifiers m
where m.name = 'extra nutella'
  and m.product_id = '22222222-2222-2222-2222-222222222202'
on conflict (modifier_id, inventory_item_id) do nothing;

insert into public.modifier_recipes (modifier_id, inventory_item_id, quantity_required)
select m.id, '33333333-3333-3333-3333-333333333306', 15
from public.modifiers m
where m.name = 'extra chocolate sauce'
  and m.product_id = '22222222-2222-2222-2222-222222222205'
on conflict (modifier_id, inventory_item_id) do nothing;

insert into public.modifier_recipes (modifier_id, inventory_item_id, quantity_required)
select m.id, '33333333-3333-3333-3333-333333333307', 10
from public.modifiers m
where m.name = 'extra walnut'
  and m.product_id = '22222222-2222-2222-2222-222222222206'
on conflict (modifier_id, inventory_item_id) do nothing;
