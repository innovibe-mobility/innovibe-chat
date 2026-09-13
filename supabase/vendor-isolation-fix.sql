-- Supersedes the earlier vendor view-policy: vendors should NEVER see
-- any public/shared channel (not #general, not #vendors, nothing) --
-- only the one private channel created specifically for their company.
-- This keeps every vendor's conversation completely separate from
-- every other vendor's.

drop policy if exists "View public channels or channels you belong to" on channels;

create policy "View public channels or channels you belong to"
  on channels for select
  using (
    (
      is_private = false
      and not exists (
        select 1 from profiles
        where profiles.id = auth.uid() and profiles.role = 'vendor'
      )
    )
    or created_by = auth.uid()
    or exists (
      select 1 from channel_members
      where channel_members.channel_id = channels.id
      and channel_members.user_id = auth.uid()
    )
  );

-- The old shared #vendors channel is no longer the right model -- each
-- vendor now gets their own private channel instead (see below). You
-- can leave this one as an internal-only channel for your team to
-- discuss vendors generally, or delete it -- your call.
