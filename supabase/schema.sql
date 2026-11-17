-- FD Orders schema: customers and orders tables with row-level security.
-- Run once in the Supabase SQL editor, and disable public sign-ups in Auth settings.

-- ---------- CUSTOMERS ----------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),  -- a random unique ID
  name        text not null,
  phone       text not null unique,       -- digits only, e.g. 7185550123
  address     text,                       -- street address (for deliveries)
  apt         text,
  city        text default 'Staten Island',
  zip         text,
  notes       text,                       -- e.g. "ring side door", "allergic to nuts"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- ORDERS ----------
create table if not exists public.orders (
  id              bigint generated always as identity primary key,  -- 1, 2, 3... (easy to say on the phone)
  customer_id     uuid not null references public.customers(id) on delete restrict,
  kind            text not null check (kind in ('grocery', 'catering')),
  fulfillment     text not null check (fulfillment in ('pickup', 'delivery')),
  status          text not null default 'new'
                  check (status in ('new', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')),
  due_at          timestamptz not null,   -- when it should be picked up / delivered
  items           jsonb,
  items_text      text,                   -- grocery: the shopping list as typed
  subtotal        numeric(10,2) not null default 0,
  delivery_fee    numeric(10,2) not null default 0,
  tax             numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  deposit_paid    numeric(10,2) not null default 0,
  payment_method  text,                   -- Cash, Card, EBT, ...
  delivery_address text,
  notes           text,
  created_by      uuid default auth.uid(),-- which staff login created it
  created_at      timestamptz not null default now()
);

create index if not exists orders_due_at_idx on public.orders (due_at);
create index if not exists orders_customer_idx on public.orders (customer_id);

-- ---------- KEEP updated_at CURRENT ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
for each row execute function public.touch_updated_at();

-- ---------- SECURITY: ROW LEVEL SECURITY (RLS) ----------
alter table public.customers enable row level security;
alter table public.orders    enable row level security;

drop policy if exists "staff can do everything" on public.customers;
create policy "staff can do everything" on public.customers
  for all to authenticated using (true) with check (true);

drop policy if exists "staff can do everything" on public.orders;
create policy "staff can do everything" on public.orders
  for all to authenticated using (true) with check (true);

-- ---------- SECURITY: WHO MAY USE THE TABLES AT ALL ----------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
-- needed for identity columns
grant usage, select on all sequences in schema public to authenticated;

revoke all on public.customers from anon;
revoke all on public.orders from anon;
