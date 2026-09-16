-- taking a cancelled ticket off the till's order history.
--
-- the row is not deleted. there is no delete policy on orders and there is not
-- going to be one: the day's takings, the stock accounting, the cancelled count
-- on the admin report and the answer to "who voided this" all hang off it, and
-- a deleted sale also leaves a hole in the ticket numbers that the next person
-- to read the list has to explain.
--
-- what was actually wanted was the cancelled ticket gone from the list the
-- cashier looks at all day. that is a decision about a view, so it is stored as
-- one, and nothing downstream of it changes.

alter table public.orders
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users (id) on delete set null;

comment on column public.orders.hidden_at is
  'when an admin took this cancelled ticket off the till order history. null means it is on the list. the sale is untouched and still counted as cancelled in reports.';
comment on column public.orders.hidden_by is
  'the admin who hid it. hiding rather than deleting exists so this question stays answerable.';

-- only a cancelled ticket may be hidden.
--
-- a live sale missing from the history is a sale nobody can look up, reprint,
-- or explain to the customer holding its receipt - and it would still be in the
-- takings, so the money and the list would disagree with nothing on screen to
-- say why. the server action checks this too; this is the half that holds even
-- if something goes at the table directly.
alter table public.orders
  drop constraint if exists orders_hidden_only_cancelled;
alter table public.orders
  add constraint orders_hidden_only_cancelled
  check (hidden_at is null or status = 'cancelled');

-- proof it landed. the supabase sql editor runs only the selected text when
-- anything is selected, so a run can look successful and create nothing.
-- two rows here or it did not run.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in ('hidden_at', 'hidden_by')
order by column_name;
