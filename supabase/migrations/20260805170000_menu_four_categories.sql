-- four categories instead of seven cuisines.
--
-- the seven fusions are still the menu, but they are no longer seven separate
-- categories. the client wants the till and the qr menu grouped the way a
-- customer thinks - desserts, extras, boxes, beverages - not the way the brand
-- book groups the range.
--
-- the cuisine colour is not lost. it moves off the category and onto the
-- product, so a cashier reaching for the red card is still reaching for roma
-- even though the tab above it now says "desserts".
--
-- nothing is deleted here either. categories are deactivated rather than
-- dropped, because the retired products from the old bakery menu still point at
-- theirs and orders that really happened still point at those products.

-- a category can now be taken off the till without being removed from the
-- database. the four below are the only active ones after this migration.
alter table public.categories
  add column if not exists is_active boolean not null default true;

-- the cuisine colour, per product. nullable: a product that has never been
-- given one just renders without the accent stripe.
alter table public.products
  add column if not exists color text;

-- carry the colour down from the category before anything is moved. this is the
-- only moment the mapping still exists - after the move every dessert sits in
-- one category and there is nothing left to copy from.
update public.products p
set color = c.color
from public.categories c
where p.category_id = c.id
  and p.color is null
  and c.color is not null;

-- the four the customer sees. colours come from the anchor and cuisine palette
-- rather than new values, so the tabs still belong to the brand.
insert into public.categories (name, color, sort_order, is_active)
select v.name, v.color, v.sort_order, true
from (
  values
    ('desserts', '#D4A24A', 1),
    ('extras', '#7BA05B', 2),
    ('boxes', '#0E1B2C', 3),
    ('beverages', '#3B5999', 4)
) as v (name, color, sort_order)
where not exists (
  select 1 from public.categories c where c.name = v.name
);

-- boxes and beverages already existed, so they are updated in place rather than
-- inserted twice. beverages is deliberately left empty: the old drinks were
-- retired with the bakery menu and admin adds the real ones.
update public.categories c
set color = v.color,
    sort_order = v.sort_order,
    is_active = true
from (
  values
    ('desserts', '#D4A24A', 1),
    ('extras', '#7BA05B', 2),
    ('boxes', '#0E1B2C', 3),
    ('beverages', '#3B5999', 4)
) as v (name, color, sort_order)
where c.name = v.name;

-- every dessert that is still on sale moves into the one desserts category.
-- the boxes stay where they are, which is why they are excluded by name.
update public.products p
set category_id = (select id from public.categories where name = 'desserts')
where p.is_available = true
  and p.category_id in (
    select id from public.categories
    where name in (
      'roma', 'tokyo', 'riyadh', 'beirut', 'madrid', 'paris', 'marrakesh'
    )
  );

-- anything that is not one of the four drops off the till, the qr menu and the
-- admin picker. the rows stay so old orders and retired products keep resolving.
update public.categories
set is_active = false
where name not in ('desserts', 'extras', 'boxes', 'beverages');
