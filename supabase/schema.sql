-- InnoVibe Chat: Database schema for Supabase
-- Run this once in your Supabase project's SQL Editor (Supabase dashboard -> SQL Editor -> New query)

-- 1. Employee profile, linked to Supabase's built-in auth.users table
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  role text default 'employee', -- e.g. employee, hr, ceo, technician
  avatar_url text,
  created_at timestamp with time zone default now()
);

-- 2. Channels (e.g. #general, #hr, #announcements)
create table if not exists channels (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  is_private boolean default false,
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
);

-- 3. Who belongs to which channel (needed for private channels + DMs)
create table if not exists channel_members (
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamp with time zone default now(),
  primary key (channel_id, user_id)
);

-- 4. Messages
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  channel_id uuid references channels(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  content text,
  file_url text,       -- set when the message is/has a shared file
  file_name text,
  created_at timestamp with time zone default now()
);

-- 5. Direct messages are just private 2-person channels.
--    (No separate table needed -- a private channel with exactly
--    2 members IS a DM. Keeps the design simple.)

-- ---------- Row Level Security (RLS) ----------
-- This is what makes it safe to use the public "anon" key in the
-- browser: these rules stop employees from reading/writing data
-- they shouldn't touch, no matter what the frontend code does.

alter table profiles enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;

-- Anyone logged in can see basic profile info (name, avatar) of others
create policy "Profiles are viewable by authenticated users"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Public channels are visible to everyone logged in;
-- private channels (incl. DMs) only to their members
create policy "View public channels or channels you belong to"
  on channels for select
  using (
    is_private = false
    or exists (
      select 1 from channel_members
      where channel_members.channel_id = channels.id
      and channel_members.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create channels"
  on channels for insert
  with check (auth.role() = 'authenticated');

create policy "View your own channel memberships"
  on channel_members for select
  using (auth.uid() = user_id);

create policy "Users can join channels"
  on channel_members for insert
  with check (auth.uid() = user_id);

-- Messages: only visible to members of that channel
create policy "View messages in channels you belong to"
  on messages for select
  using (
    exists (
      select 1 from channels
      where channels.id = messages.channel_id
      and (
        channels.is_private = false
        or exists (
          select 1 from channel_members
          where channel_members.channel_id = channels.id
          and channel_members.user_id = auth.uid()
        )
      )
    )
  );

create policy "Send messages to channels you belong to"
  on messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from channels
      where channels.id = messages.channel_id
      and (
        channels.is_private = false
        or exists (
          select 1 from channel_members
          where channel_members.channel_id = channels.id
          and channel_members.user_id = auth.uid()
        )
      )
    )
  );

-- ---------- Starter channels ----------
insert into channels (name, description, is_private)
values
  ('general', 'Company-wide announcements and chat', false),
  ('hr', 'HR updates and questions', false),
  ('ceo-updates', 'Announcements from leadership', false),
  ('service-team', 'Service Manager team coordination', false),
  ('technicians', 'Technician team chat', false)
on conflict (name) do nothing;

-- ---------- File storage bucket ----------
-- After running this file, also go to Supabase Dashboard -> Storage
-- and create a bucket named "chat-files" (set to "Public" off,
-- authenticated access only) for shared files/images.
