-- ============================================================
-- INNOVIBE CHAT ENHANCEMENTS
-- ADDITIVE MIGRATION
-- Does not delete existing messages/channels/profiles.
-- ============================================================


-- ============================================================
-- 1. MESSAGE EDIT / DELETE SUPPORT
-- ============================================================

alter table messages
add column if not exists updated_at timestamptz;

alter table messages
add column if not exists is_deleted boolean default false;


-- ============================================================
-- 2. THREAD / REPLY SUPPORT
-- ============================================================

alter table messages
add column if not exists parent_message_id uuid
references messages(id)
on delete set null;

create index if not exists messages_parent_message_idx
on messages(parent_message_id);


-- ============================================================
-- 3. MESSAGE REACTIONS
-- ============================================================

create table if not exists message_reactions (
  id uuid default gen_random_uuid() primary key,

  message_id uuid
    references messages(id)
    on delete cascade
    not null,

  user_id uuid
    references profiles(id)
    on delete cascade
    not null,

  reaction text not null,

  created_at timestamptz default now(),

  unique(message_id, user_id, reaction)
);

alter table message_reactions enable row level security;


-- Users can see reactions on messages they can access.
drop policy if exists "Users can view message reactions"
on message_reactions;

create policy "Users can view message reactions"
on message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from messages m
    where m.id = message_reactions.message_id
  )
);


-- Users can add their own reaction.
drop policy if exists "Users can add message reactions"
on message_reactions;

create policy "Users can add message reactions"
on message_reactions
for insert
to authenticated
with check (
  auth.uid() = user_id
);


-- Users can remove their own reaction.
drop policy if exists "Users can remove own reactions"
on message_reactions;

create policy "Users can remove own reactions"
on message_reactions
for delete
to authenticated
using (
  auth.uid() = user_id
);


-- ============================================================
-- 4. READ RECEIPTS
-- ============================================================

create table if not exists message_reads (
  message_id uuid
    references messages(id)
    on delete cascade
    not null,

  user_id uuid
    references profiles(id)
    on delete cascade
    not null,

  read_at timestamptz default now(),

  primary key(message_id, user_id)
);

alter table message_reads enable row level security;


drop policy if exists "Users can view message reads"
on message_reads;

create policy "Users can view message reads"
on message_reads
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from messages m
    where m.id = message_reads.message_id
  )
);


drop policy if exists "Users can mark messages read"
on message_reads;

create policy "Users can mark messages read"
on message_reads
for insert
to authenticated
with check (
  auth.uid() = user_id
);


drop policy if exists "Users can update own read receipts"
on message_reads;

create policy "Users can update own read receipts"
on message_reads
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- ============================================================
-- 5. CHANNEL READ STATE
-- Used for unread counts.
-- ============================================================

create table if not exists channel_reads (
  channel_id uuid
    references channels(id)
    on delete cascade
    not null,

  user_id uuid
    references profiles(id)
    on delete cascade
    not null,

  last_read_at timestamptz default now(),

  primary key(channel_id, user_id)
);

alter table channel_reads enable row level security;


drop policy if exists "Users can view own channel reads"
on channel_reads;

create policy "Users can view own channel reads"
on channel_reads
for select
to authenticated
using (
  auth.uid() = user_id
);


drop policy if exists "Users can create own channel reads"
on channel_reads;

create policy "Users can create own channel reads"
on channel_reads
for insert
to authenticated
with check (
  auth.uid() = user_id
);


drop policy if exists "Users can update own channel reads"
on channel_reads;

create policy "Users can update own channel reads"
on channel_reads
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- ============================================================
-- 6. NOTIFICATIONS
-- ============================================================

create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,

  user_id uuid
    references profiles(id)
    on delete cascade
    not null,

  sender_id uuid
    references profiles(id)
    on delete set null,

  channel_id uuid
    references channels(id)
    on delete cascade,

  message_id uuid
    references messages(id)
    on delete cascade,

  type text default 'message',

  title text not null,

  body text,

  is_read boolean default false,

  created_at timestamptz default now()
);

alter table notifications enable row level security;


drop policy if exists "Users can view own notifications"
on notifications;

create policy "Users can view own notifications"
on notifications
for select
to authenticated
using (
  auth.uid() = user_id
);


drop policy if exists "Users can update own notifications"
on notifications;

create policy "Users can update own notifications"
on notifications
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


create index if not exists notifications_user_created_idx
on notifications(user_id, created_at desc);


create index if not exists notifications_unread_idx
on notifications(user_id, is_read);


-- ============================================================
-- 7. AUTOMATIC MESSAGE NOTIFICATIONS
-- ============================================================

create or replace function public.create_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
begin

  select full_name
  into sender_name
  from profiles
  where id = new.sender_id;

  -- Notify users who are members of a private channel.
  if exists (
    select 1
    from channels
    where channels.id = new.channel_id
    and channels.is_private = true
  ) then

    insert into notifications (
      user_id,
      sender_id,
      channel_id,
      message_id,
      type,
      title,
      body
    )
    select
      cm.user_id,
      new.sender_id,
      new.channel_id,
      new.id,
      'message',
      coalesce(sender_name, 'Employee') || ' sent a message',
      coalesce(new.content, '📎 Shared a file')
    from channel_members cm
    where cm.channel_id = new.channel_id
    and cm.user_id <> new.sender_id;

  else

    -- Public company channels.
    insert into notifications (
      user_id,
      sender_id,
      channel_id,
      message_id,
      type,
      title,
      body
    )
    select
      p.id,
      new.sender_id,
      new.channel_id,
      new.id,
      'message',
      coalesce(sender_name, 'Employee') || ' sent a message',
      coalesce(new.content, '📎 Shared a file')
    from profiles p
    where p.id <> new.sender_id;

  end if;

  return new;
end;
$$;


drop trigger if exists message_notification_trigger
on messages;

create trigger message_notification_trigger
after insert on messages
for each row
execute function public.create_message_notifications();


-- ============================================================
-- 8. CHANNEL TYPE
-- Allows us to distinguish normal private channels,
-- individual DMs and group DMs.
-- ============================================================

alter table channels
add column if not exists channel_type text default 'channel';

alter table channels
add column if not exists display_name text;


-- Existing private channels remain individual DMs.
update channels
set channel_type = 'dm'
where is_private = true
and channel_type = 'channel';


-- ============================================================
-- 9. AUDIT LOG
-- ============================================================

create table if not exists chat_audit_logs (
  id uuid default gen_random_uuid() primary key,

  user_id uuid
    references profiles(id)
    on delete set null,

  action text not null,

  message_id uuid
    references messages(id)
    on delete set null,

  channel_id uuid
    references channels(id)
    on delete set null,

  details jsonb default '{}'::jsonb,

  created_at timestamptz default now()
);

alter table chat_audit_logs enable row level security;


-- Employees may create their own audit event through trusted
-- application operations.
drop policy if exists "Users can create own chat audit logs"
on chat_audit_logs;

create policy "Users can create own chat audit logs"
on chat_audit_logs
for insert
to authenticated
with check (
  auth.uid() = user_id
);


-- Only HR/CEO can view chat audit logs.
drop policy if exists "Management can view chat audit logs"
on chat_audit_logs;

create policy "Management can view chat audit logs"
on chat_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
    and lower(profiles.role) in ('ceo', 'hr')
  )
);


-- ============================================================
-- 10. PERFORMANCE INDEXES
-- ============================================================

create index if not exists messages_channel_created_idx
on messages(channel_id, created_at);

create index if not exists message_reactions_message_idx
on message_reactions(message_id);

create index if not exists message_reads_user_idx
on message_reads(user_id);

create index if not exists channel_reads_user_idx
on channel_reads(user_id);