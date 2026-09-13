-- Run this ONCE for each new vendor you approve, after you've already
-- created their login (Authentication -> Add user) and set their role
-- to 'vendor' in the profiles table.
--
-- Replace the three things marked <<...>> below with real values.

-- Step 1: create their private channel (only they + your team see it)
insert into channels (name, description, is_private, created_by)
values (
  'vendor-<<rajesh-ecstar>>',              -- e.g. 'vendor-acme-corp' (no spaces)
  '<<ecstar>> -- private vendor channel',
  true,
  (select id from auth.users where email = 'greeshmasatyasrid@gmail.com')
)
returning id;

-- Step 2: add the vendor as a member of that channel.
-- Copy the "id" returned above and paste it in place of <<channel-id>>.
-- Copy the vendor's user id (Authentication -> find them -> copy their
-- User UID) in place of <<vendor-user-id>>.
insert into channel_members (channel_id, user_id)
values ('<<channel-id>>', '<<vendor-user-id>>');

-- Step 3 (optional): also add yourself or whoever manages vendor
-- relationships, so your team can actually talk to them in there.
insert into channel_members (channel_id, user_id)
values (
  '<<channel-id>>',
  (select id from auth.users where email = '<<your-own-admin-email>>')
);
