-- Run this once in Supabase SQL Editor.

-- 1. Fold existing Technician and Service Manager accounts into Employee,
--    per Sir's instruction (those are no longer separate roles).
update profiles set role = 'employee' where role in ('technician', 'service_manager');

-- 2. Create a dedicated channel for external vendors. Vendors chat here
--    only -- this keeps their communication on-record and separate from
--    internal-only channels (hr, ceo-updates, etc).
insert into channels (name, description, is_private)
values ('vendors', 'External vendor communication -- for records', false)
on conflict (name) do nothing;

-- 3. Restrict who can post in internal-only channels so vendors can't
--    post there -- vendors are limited to #vendors and #general.
--    (Adjust this list if you want vendors to see more/less.)
update channels set post_roles = array['employee', 'ceo', 'hr']
where name in ('hr', 'service-team', 'technicians');

-- Confirm the result
select full_name, role from profiles;
select name, is_private, post_roles from channels;
