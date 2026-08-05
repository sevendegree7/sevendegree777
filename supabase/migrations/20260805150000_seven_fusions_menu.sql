-- the real menu: seven fusions, one cairo.
--
-- replaces the placeholder bakery list (cinnabon, croissants, brownies) that
-- the project was built against with the range from the brand book. every
-- category carries its cuisine colour, which is what the till and the public
-- menu colour themselves from.
--
-- prices are the deck's numbers and are explicitly temporary - the client has
-- not signed off on them. changing one later is an admin edit, not a migration.
--
-- nothing is deleted. the old products are retired instead, because order_items
-- points at them and a dry run has already been done on this database: a
-- deleted product would null out the link on sales that really happened.

-- retire the placeholders. they drop off the till and the public menu, and stay
-- readable on any receipt or report that already references them.
update public.products
set is_available = false
where name in (
  'classic cinnabon',
  'nutella cinnabon',
  'butter croissant',
  'chocolate croissant',
  'classic brownie',
  'walnut brownie',
  'turkish coffee',
  'fresh juice'
);

-- one category per cuisine, in the deck's order, plus the box formats.
--
-- the colour is the same hex the packaging and the sleeves use, so a cashier
-- reaching for the red tab is reaching for the same red that is on the box.
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

-- an existing category of the same name keeps its row but takes the brand
-- colour, so a database that was seeded before this migration still ends up
-- with the palette
update public.categories c
set color = v.color,
    sort_order = v.sort_order
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
where c.name = v.name;

-- the single serve glass cup, one per cuisine. the tiramisu umm ali is the
-- hero and sits first.
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

-- placeholder extras so the modifier flow has something to show. the brand book
-- does not specify add-ons, so these are for the demo and admin should replace
-- them before launch.
insert into public.modifiers (product_id, name, extra_price)
select p.id, v.name, v.extra_price
from (
  values
    ('tiramisu umm ali', 'extra cocoa dust', 0.00),
    ('tiramisu umm ali', 'extra pistachio crumble', 25.00),
    ('saffron kunafa', 'extra rose-cardamom syrup', 20.00)
) as v (product, name, extra_price)
join public.products p on p.name = v.product
where not exists (
  select 1
  from public.modifiers m
  where m.product_id = p.id and m.name = v.name
);

-- the vitrine counts finished units, so every sellable product needs a row to
-- count. receiving stock upserts anyway, but a product with no row is invisible
-- on the stock screen until the first delivery is logged.
insert into public.product_stock (product_id)
select p.id
from public.products p
on conflict (product_id) do nothing;
