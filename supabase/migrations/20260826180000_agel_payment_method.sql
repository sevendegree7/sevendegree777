-- add agel to the payment method enum.
-- must be its own migration: postgres will not let a later statement in the
-- same transaction use a value that was just added.
alter type public.payment_method add value if not exists 'agel';
