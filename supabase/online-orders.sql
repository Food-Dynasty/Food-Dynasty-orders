-- =====================================================================
-- ONLINE CATERING ORDERS -> FD ORDERS
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- The public website is NOT signed in, so it has no access to the tables
-- (see schema.sql). Instead it gets ONE door: the function below.
-- The function runs with the database owner's rights ("security definer"),
-- checks everything the website sends, and can only ADD a new catering order.
-- It cannot read, change or delete anything.
-- =====================================================================


-- Mark where each order came from: taken by staff, or sent from the website
alter table public.orders
  add column if not exists source text not null default 'staff'
  check (source in ('staff', 'online'));


create or replace function public.submit_online_order(payload jsonb)
returns bigint                      -- the new order number
language plpgsql
security definer                    -- runs as the owner, so it can write past RLS...
set search_path = public            -- ...and only ever looks in the public schema
as $$
declare
  c            jsonb       := payload -> 'customer';
  v_phone      text        := regexp_replace(coalesce(c ->> 'phone', ''), '\D', '', 'g');
  v_name       text        := left(btrim(coalesce(c ->> 'name', '')), 100);
  v_items      jsonb       := payload -> 'items';
  v_fulfill    text        := payload ->> 'fulfillment';
  v_due        timestamptz;
  v_customer   uuid;
  v_order      bigint;
  v_recent     int;
begin
  -- ---------- check everything (never trust what a website sends) ----------
  if length(v_phone) = 11 and left(v_phone, 1) = '1' then
    v_phone := substr(v_phone, 2);              -- drop a leading US "1"
  end if;
  if length(v_phone) <> 10 then raise exception 'invalid phone'; end if;
  if v_name = '' then raise exception 'name required'; end if;
  if v_fulfill not in ('pickup', 'delivery') then raise exception 'invalid fulfillment'; end if;
  if jsonb_typeof(v_items) is distinct from 'array'
     or jsonb_array_length(v_items) = 0
     or jsonb_array_length(v_items) > 100 then
    raise exception 'invalid items';
  end if;

  v_due := (payload ->> 'due_at')::timestamptz;
  if v_due < now() or v_due > now() + interval '180 days' then
    raise exception 'invalid date';
  end if;

  -- Spam limit: at most 5 online orders per phone number per day
  select count(*) into v_recent
  from orders o join customers cu on cu.id = o.customer_id
  where cu.phone = v_phone and o.source = 'online' and o.created_at > now() - interval '1 day';
  if v_recent >= 5 then raise exception 'too many orders'; end if;

  -- ---------- find or create the customer (matched by phone) ----------
  select id into v_customer from customers where phone = v_phone;

  if v_customer is null then
    insert into customers (name, phone, address, apt, city, zip)
    values (
      v_name, v_phone,
      nullif(left(btrim(c ->> 'address'), 200), ''),
      nullif(left(btrim(c ->> 'apt'), 100), ''),
      coalesce(nullif(left(btrim(c ->> 'city'), 100), ''), 'Staten Island'),
      nullif(left(btrim(c ->> 'zip'), 10), '')
    )
    returning id into v_customer;
  else
    -- Existing customer: only FILL IN a missing address; never overwrite what staff saved
    update customers set
      address = coalesce(address, nullif(left(btrim(c ->> 'address'), 200), '')),
      apt     = coalesce(apt,     nullif(left(btrim(c ->> 'apt'), 100), '')),
      zip     = coalesce(zip,     nullif(left(btrim(c ->> 'zip'), 10), ''))
    where id = v_customer;
  end if;

  -- ---------- save the order ----------
  -- Money values are kept within sane limits; staff confirm prices by phone,
  -- and the FD Orders app re-checks every line against the menu.
  insert into orders (
    customer_id, kind, fulfillment, status, due_at, items,
    subtotal, delivery_fee, tax, total, deposit_paid, payment_method,
    delivery_address, notes, source, created_by
  ) values (
    v_customer, 'catering', v_fulfill, 'new', v_due, v_items,
    least(greatest(coalesce((payload ->> 'subtotal')::numeric, 0), 0), 100000),
    least(greatest(coalesce((payload ->> 'delivery_fee')::numeric, 0), 0), 1000),
    least(greatest(coalesce((payload ->> 'tax')::numeric, 0), 0), 100000),
    least(greatest(coalesce((payload ->> 'total')::numeric, 0), 0), 100000),
    0, 'Not paid yet',
    case when v_fulfill = 'delivery' then left(payload ->> 'delivery_address', 300) end,
    left(payload ->> 'notes', 1000),
    'online', null
  )
  returning id into v_order;

  return v_order;
end $$;

-- Only this function is opened to the public website ("anon"), nothing else
revoke all on function public.submit_online_order(jsonb) from public;
grant execute on function public.submit_online_order(jsonb) to anon, authenticated;
