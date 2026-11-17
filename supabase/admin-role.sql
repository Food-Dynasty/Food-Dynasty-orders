-- Admin role: admins manage everything on the website; staff manage orders and the
-- weekly ad only. Holiday menus (and their files) are admin-only. Requires website-flyers.sql.
-- To make someone an admin: insert into public.app_admins (user_id)
--   select id from auth.users where email = '<their email>';

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- True when the signed-in user is an admin. security definer so it can read
-- app_admins, which nobody can query directly.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------- Flyers: staff can manage weekly ads, only admins holiday menus ----------
drop policy if exists "staff can do everything" on public.flyers;
drop policy if exists "staff read flyers" on public.flyers;
drop policy if exists "staff manage weekly, admins manage all" on public.flyers;

create policy "staff read flyers" on public.flyers
  for select to authenticated using (true);

create policy "staff manage weekly, admins manage all" on public.flyers
  for all to authenticated
  using (kind = 'weekly' or public.is_admin())
  with check (kind = 'weekly' or public.is_admin());

-- ---------- Storage: same rule, by folder (weekly/... vs holiday/...) ----------
drop policy if exists "staff upload flyers" on storage.objects;
drop policy if exists "staff change flyers" on storage.objects;
drop policy if exists "staff delete flyers" on storage.objects;

create policy "staff upload flyers" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'flyers' and ((storage.foldername(name))[1] = 'weekly' or public.is_admin()));

create policy "staff change flyers" on storage.objects
  for update to authenticated
  using (bucket_id = 'flyers' and ((storage.foldername(name))[1] = 'weekly' or public.is_admin()))
  with check (bucket_id = 'flyers' and ((storage.foldername(name))[1] = 'weekly' or public.is_admin()));

create policy "staff delete flyers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'flyers' and ((storage.foldername(name))[1] = 'weekly' or public.is_admin()));
