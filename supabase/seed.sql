-- the seven fusions menu for a fresh local database.
--
-- no hardcoded uuids: postgres assigns them. join by name so the same seed can
-- re-run against a database that already has some of these rows.
--
-- prices are the deck's numbers and are temporary until the client signs off.

insert into public.categories (name, color, sort_order)
select v.name, v.color, v.sort_order
from (
  values
    ('roma', '#E04F3E', 1),
    ('tokyo', '#3B5999', 2),
    ('riyadh', '#D4A24A', 3),
    ('beirut', '#7BA05B', 4),
    ('madrid', '#6C0F2A', 5),
    ('paris', '#D27B8C', 6),
    ('marrakesh', '#7C2D26', 7),
    ('boxes', '#0E1B2C', 8)
) as v (name, color, sort_order)
where not exists (
  select 1 from public.categories c where c.name = v.name
);

insert into public.products (category_id, name, base_price, is_available, sort_order)
select c.id, v.name, v.price, true, v.sort_order
from (
  values
    ('roma', 'tiramisu umm ali', 220.00, 1),
    ('tokyo', 'pistachio mochi', 200.00, 2),
    ('riyadh', 'saffron kunafa', 210.00, 3),
    ('beirut', 'konafa cheesecake', 200.00, 4),
    ('madrid', 'churros konafa', 190.00, 5),
    ('paris', 'rose eclair', 190.00, 6),
    ('marrakesh', 'pomegranate panna cotta', 180.00, 7),
    ('boxes', 'small box · 6', 400.00, 8),
    ('boxes', 'the seven · box', 775.00, 9),
    ('boxes', 'large bento · 24', 1500.00, 10)
) as v (category, name, price, sort_order)
join public.categories c on c.name = v.category
where not exists (
  select 1 from public.products p where p.name = v.name
);

-- shared extras: one row, one price, offered on every product
insert into public.modifiers (product_id, name, extra_price, is_active)
select null, v.name, v.extra_price, true
from (
  values
    ('extra cocoa dust', 0.00),
    ('extra pistachio crumble', 25.00),
    ('extra rose-cardamom syrup', 20.00)
) as v (name, extra_price)
where not exists (
  select 1
  from public.modifiers m
  where lower(m.name) = lower(v.name)
);
