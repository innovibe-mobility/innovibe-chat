-- 1. Add vendor company details to profiles (used to show their own
--    logo instead of InnoVibe's when they log in).
alter table profiles add column if not exists company_name text;
alter table profiles add column if not exists company_logo_url text;

-- 2. A public application form table -- prospective vendors fill this
--    in themselves (no login needed). You review these, then create
--    their actual login afterward.
create table if not exists vendor_applications (
  id uuid default gen_random_uuid() primary key,
  company_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  logo_url text,
  status text default 'pending', -- pending, approved, rejected
  created_at timestamp with time zone default now()
);

alter table vendor_applications enable row level security;

-- Anyone (even not logged in) can SUBMIT an application
create policy "Anyone can submit a vendor application"
  on vendor_applications for insert
  to anon, authenticated
  with check (true);

-- Only logged-in admins should read these -- for now, any logged-in
-- employee/ceo/hr can view them (tighten this to ceo-only later if
-- you want stricter control)
create policy "Logged-in staff can view applications"
  on vendor_applications for select
  to authenticated
  using (true);

-- 3. Storage bucket for vendor logos uploaded during application
--    (public so the logo displays properly once approved)
insert into storage.buckets (id, name, public)
values ('vendor-logos', 'vendor-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can upload a vendor logo" on storage.objects;
create policy "Anyone can upload a vendor logo"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'vendor-logos');

drop policy if exists "Anyone can view vendor logos" on storage.objects;
create policy "Anyone can view vendor logos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'vendor-logos');

-- 4. Restrict which channels vendors can even SEE (not just post in).
--    Vendors should only see #general, #vendors, and #ceo-updates
--    (read-only) -- not hr, service-team, or technicians at all.
drop policy if exists "View public channels or channels you belong to" on channels;

create policy "View public channels or channels you belong to"
  on channels for select
  using (
    (
      is_private = false
      and (
        name in ('general', 'vendors', 'ceo-updates')
        or not exists (
          select 1 from profiles
          where profiles.id = auth.uid() and profiles.role = 'vendor'
        )
      )
    )
    or created_by = auth.uid()
    or exists (
      select 1 from channel_members
      where channel_members.channel_id = channels.id
      and channel_members.user_id = auth.uid()
    )
  );
