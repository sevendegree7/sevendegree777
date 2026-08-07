-- shifts and customer details on the order
-- forward-only migration for the already-running shared / production database

-- a till session: one person takes the drawer, sells for a few hours, counts it
-- back and hands over. the truck has two cashiers sharing one tablet, so this
-- is what separates "her orders" from "his orders" when the money is short.
--
-- deliberately not a "who is signed in" record - that already exists in the
-- browser (lib/auth/shift.ts) and answers a different question. this one has to
-- survive the tablet being wiped, because it is what the owner counts against.
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),

  -- who took the drawer. the name is snapshotted next to the id for the same
  -- reason orders.created_by_name is: a printed shift report has to still name
  -- the right person after a rename or after they leave.
  opened_by uuid references auth.users (id) on delete set null,
  opened_by_name text not null,
  opened_at timestamptz not null default now(),

  -- whoever actually closed it, which is not always whoever opened it: someone
  -- who walks off without closing gets closed out by the next person, and that
  -- is exactly the case the owner will want a name against.
  closed_by uuid references auth.users (id) on delete set null,
  closed_by_name text,
  closed_at timestamptz,

  -- the float in the drawer at the start, and the cash counted at the end.
  -- counted_cash stays null until the shift is closed, so "closed without
  -- counting" is a state that can be told apart from "counted zero".
  opening_float numeric(12, 2) not null default 0 check (opening_float >= 0),
  counted_cash numeric(12, 2) check (counted_cash >= 0),

  notes text,
  created_at timestamptz not null default now(),

  -- a shift cannot close before it opened
  constraint shifts_closed_after_opened
    check (closed_at is null or closed_at >= opened_at),
  -- counting cash on a shift that is still open would be a half-closed shift
  constraint shifts_counted_only_when_closed
    check (counted_cash is null or closed_at is not null)
);

-- one till, one drawer, one open shift. the whole system is a single tablet, so
-- two open shifts would mean two people believe they hold the same cash. this
-- is what makes the handover explicit: the next person cannot open until the
-- last one is closed.
create unique index if not exists shifts_single_open
  on public.shifts ((closed_at is null))
  where closed_at is null;

create index if not exists shifts_opened_at_idx
  on public.shifts (opened_at desc);

alter table public.shifts enable row level security;

drop policy if exists "shifts_select_staff" on public.shifts;
drop policy if exists "shifts_insert_till" on public.shifts;
drop policy if exists "shifts_update_till" on public.shifts;

create policy "shifts_select_staff"
on public.shifts for select to authenticated
using (public.current_user_role() in ('admin', 'cashier', 'kitchen'));

-- a cashier can only open a shift in their own name. without the auth.uid()
-- check the drawer could be signed out to someone who is not there.
create policy "shifts_insert_till"
on public.shifts for insert to authenticated
with check (
  public.current_user_role() in ('admin', 'cashier')
  and opened_by = auth.uid()
);

-- but anyone on the till can close one, including a shift they did not open.
-- closed_by records who actually did it.
create policy "shifts_update_till"
on public.shifts for update to authenticated
using (public.current_user_role() in ('admin', 'cashier'))
with check (public.current_user_role() in ('admin', 'cashier'));

-- which till session a sale belongs to.
--
-- nullable on purpose: sales rung before this migration have no shift, and a
-- sale taken offline is stamped with whichever shift is open when the tablet
-- finally uploads it. a missing shift must never stop a sale going through.
alter table public.orders
  add column if not exists shift_id uuid references public.shifts (id) on delete set null;

create index if not exists orders_shift_id_idx
  on public.orders (shift_id)
  where shift_id is not null;

-- the customer, for the truck's own contact list.
--
-- both optional and both free text. the cashier types what the customer says
-- during a rush, and a required field here would be a field filled with "-".
-- no format check on the phone for the same reason: a number that is written
-- down slightly oddly is worth more than a sale that would not go through.
alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text;

-- for looking a returning customer up by number
create index if not exists orders_customer_phone_idx
  on public.orders (customer_phone)
  where customer_phone is not null;
