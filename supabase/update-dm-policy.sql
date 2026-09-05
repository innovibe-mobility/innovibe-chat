-- Run this in Supabase SQL Editor (in addition to the original schema.sql)
-- This allows the person who creates a private channel (like a new DM)
-- to also add the other participant as a member -- needed for direct
-- messages to work, since starting a DM means adding BOTH people.

drop policy if exists "Users can join channels" on channel_members;

create policy "Users can join channels or channel creators can add members"
  on channel_members for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from channels
      where channels.id = channel_members.channel_id
      and channels.created_by = auth.uid()
    )
  );

-- Speeds up message search as the number of messages grows
create index if not exists messages_content_search_idx
  on messages using gin (to_tsvector('english', coalesce(content, '')));

-- IMPORTANT FIX: the original schema.sql never allowed a user to create
-- their own profile row, so signups were silently failing to create a
-- matching profile -- this caused "foreign key constraint" errors when
-- sending messages. This adds the missing permission.
create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);
