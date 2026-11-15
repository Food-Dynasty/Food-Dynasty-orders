-- =====================================================================
-- ONLINE GROCERY LISTS -> FD ORDERS
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- (Needs online-orders.sql to have been run first.)
--
-- A second locked-down "door" for the public website, like
-- submit_online_order, but for grocery lists: the customer types their list,
-- staff shop it at in-store prices and enter the register total in the app.
-- It can only ADD a grocery delivery order. It cannot read, change or delete.
-- =====================================================================

create or replace function public.submit_grocery_list(payload jsonb)
returns bigint                      -- the new order number
language plpgsql
security definer
set search_path = public
as $$
declare
  c          jsonb := payload -> 'customer';
  v_phone    text  := regexp_replace(coalesce(c ->> 'phone', ''), '\D', '', 'g');
  v_name     text  := left(btrim(coalesce(c ->> 'name', '')), 100);
  v_address  text  := left(btrim(coalesce(payload ->> 'delivery_address', '')), 300);
  v_text     text  := left(coalesce(payload ->> 'list', ''), 5000);
  v_lines    jsonb := '[]'::jsonb;
  v_line     text;
  v_due      timestamptz;
  v_customer uuid;
  v_order    bigint;
  v_recent   int;
begin
  -- ---------- checks ----------
  if length(v_phone) = 11 and left(v_phone, 1) = '1' then
    v_phone := substr(v_phone, 2);
  end if;
  if length(v_phone) <> 10 then raise exception 'invalid phone'; end if;
  if v_name = '' then raise exception 'name required'; end if;
  if v_address = '' then raise exception 'address required'; end if;

  -- Turn the typed list into checklist items: one line = one item.
  -- Bullets people type ("-", "*", "•", "1.") are removed; empty lines skipped.
  foreach v_line in array string_to_array(replace(v_text, E'\r', ''), E'\n') loop
    v_line := btrim(regexp_replace(v_line, '^\s*([-*•]|[0-9]+[.)])\s*', ''));
    if v_line <> '' then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('text', left(v_line, 150), 'picked', false));
    end if;
  end loop;
  if jsonb_array_length(v_lines) = 0 or jsonb_array_length(v_lines) > 150 then
    raise exception 'invalid list';
  end if;

  v_due := (payload ->> 'due_at')::timestamptz;
  if v_due < now() - interval '15 minutes' or v_due > now() + interval '14 days' then
    raise exception 'invalid date';
  end if;

  -- Same spam limit as catering: at most 5 online orders per phone per day
  select count(*) into v_recent
  from orders o join customers cu on cu.id = o.customer_id
  where cu.phone = v_phone and o.source = 'online' and o.created_at > now() - interval '1 day';
  if v_recent >= 5 then raise exception 'too many orders'; end if;

  -- ---------- find or create the customer ----------
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
    update customers set
      address = coalesce(address, nullif(left(btrim(c ->> 'address'), 200), '')),
      apt     = coalesce(apt,     nullif(left(btrim(c ->> 'apt'), 100), '')),
      zip     = coalesce(zip,     nullif(left(btrim(c ->> 'zip'), 10), ''))
    where id = v_customer;
  end if;

  -- ---------- save the order (no total yet: staff enter it after shopping) ----------
  insert into orders (
    customer_id, kind, fulfillment, status, due_at, items, items_text,
    subtotal, delivery_fee, tax, total, deposit_paid, payment_method,
    delivery_address, notes, source, created_by
  ) values (
    v_customer, 'grocery', 'delivery', 'new', v_due, v_lines,
    (select string_agg(item ->> 'text', E'\n') from jsonb_array_elements(v_lines) as item),
    0, 0, 0, 0, 0, 'Not paid yet',
    v_address,
    left(payload ->> 'notes', 1000),
    'online', null
  )
  returning id into v_order;

  return v_order;
end $$;

revoke all on function public.submit_grocery_list(jsonb) from public;
grant execute on function public.submit_grocery_list(jsonb) to anon, authenticated;
