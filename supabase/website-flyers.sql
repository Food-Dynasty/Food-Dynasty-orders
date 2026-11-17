-- =====================================================================
-- WEBSITE FLYERS (weekly sales + holiday menus) AND IN-STORE DELIVERIES
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- (Needs schema.sql and online-orders.sql to have been run first.)
--
-- 1. A "flyers" table: one row per uploaded flyer (this week's sales, the
--    Thanksgiving menu, the Christmas menu...). Staff add them in FD Orders
--    (Website tab); the public website reads them.
-- 2. A "flyers" storage bucket: where the flyer pictures and PDFs are kept.
--    Anyone can VIEW the files (they're on the public website anyway), but only
--    signed-in staff can upload or delete.
-- 3. Orders get a new source, 'instore': a customer shopped in the store and
--    we deliver the bags to their home.
-- =====================================================================


-- ---------- 1. THE FLYERS TABLE ----------
create table if not exists public.flyers (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('weekly', 'holiday')),
  title       text not null,                       -- "Weekly Sales", "Thanksgiving Dinner"
  theme       text not null default 'general'      -- colors/decor on the holiday page
              check (theme in ('general', 'thanksgiving', 'christmas', 'easter', 'summer')),
  note        text,                                -- "Order by Nov 24. Pickup Nov 26-27."
  pages       jsonb not null default '[]'::jsonb,  -- picture addresses, one per page
  pdf_url     text,                                -- the original PDF, if one was uploaded
  starts_on   date,                                -- blank = show right away
  ends_on     date,                                -- blank = show until replaced or removed
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists flyers_kind_idx on public.flyers (kind, created_at desc);

alter table public.flyers enable row level security;

-- Staff: full control
drop policy if exists "staff can do everything" on public.flyers;
create policy "staff can do everything" on public.flyers
  for all to authenticated using (true) with check (true);

-- The public website: may READ flyers that are showing today, nothing else
drop policy if exists "public can read current flyers" on public.flyers;
create policy "public can read current flyers" on public.flyers
  for select to anon
  using ((starts_on is null or starts_on <= (now() at time zone 'America/New_York')::date)
     and (ends_on   is null or ends_on   >= (now() at time zone 'America/New_York')::date));

grant select, insert, update, delete on public.flyers to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.flyers to anon;
revoke insert, update, delete on public.flyers from anon;


-- ---------- 2. THE FILE STORAGE BUCKET ----------
-- public = true: files can be viewed by address. 15 MB limit per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flyers', 'flyers', true, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only signed-in staff can upload, replace or delete files in this bucket
drop policy if exists "staff upload flyers" on storage.objects;
create policy "staff upload flyers" on storage.objects
  for insert to authenticated with check (bucket_id = 'flyers');

drop policy if exists "staff change flyers" on storage.objects;
create policy "staff change flyers" on storage.objects
  for update to authenticated using (bucket_id = 'flyers') with check (bucket_id = 'flyers');

drop policy if exists "staff delete flyers" on storage.objects;
create policy "staff delete flyers" on storage.objects
  for delete to authenticated using (bucket_id = 'flyers');

drop policy if exists "staff list flyers" on storage.objects;
create policy "staff list flyers" on storage.objects
  for select to authenticated using (bucket_id = 'flyers');


-- ---------- 3. IN-STORE DELIVERIES ----------
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check
  check (source in ('staff', 'online', 'instore'));
