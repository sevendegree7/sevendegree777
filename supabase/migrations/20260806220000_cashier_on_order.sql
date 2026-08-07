-- who rang this sale, in words, kept on the order itself.
--
-- `created_by` already holds the uuid, and that is the one that is joined on
-- and filtered by. this column is the name as it stood at the moment of the
-- sale, snapshotted the same way `order_items.product_name` is.
--
-- it is a snapshot and not a join on purpose. a receipt printed in march must
-- still name the person who took the money even after they leave, get renamed,
-- or have their account removed - and the till has to be able to print that
-- line with no internet, where there is no profiles table to join against.

alter table public.orders
  add column if not exists created_by_name text;

comment on column public.orders.created_by_name is
  'display name of the staff member who rang the sale, snapshotted at checkout. created_by is the authoritative id.';

-- name the sales that are already in the books
update public.orders as o
set created_by_name = p.name
from public.profiles as p
where o.created_by = p.id
  and o.created_by_name is null;
