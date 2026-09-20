-- ============================================================
-- InnoVibe Vendor Chat Phase 2
-- Run AFTER Phase 1.
-- Additive only. Does not modify employee Chat tables.
-- ============================================================

begin;

-- Private file bucket for vendor chat attachments.
insert into storage.buckets (id, name, public)
values ('vendor-chat-files', 'vendor-chat-files', false)
on conflict (id) do update set public = false;

-- Vendor users may upload only into their own vendor chat folder.
drop policy if exists "Vendor users upload vendor chat files"
on storage.objects;

create policy "Vendor users upload vendor chat files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vendor-chat-files'
  and (
    public.is_vendor_staff()
    or public.is_vendor_chat_member(
      split_part(name, '/', 1)::uuid
    )
  )
);

-- Vendor users and vendor staff may read files from permitted vendor chats.
drop policy if exists "Vendor users read vendor chat files"
on storage.objects;

create policy "Vendor users read vendor chat files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vendor-chat-files'
  and (
    public.is_vendor_staff()
    or public.is_vendor_chat_member(
      split_part(name, '/', 1)::uuid
    )
  )
);

-- Enable realtime for vendor messages if it has not already been added.
do $$
begin
  begin
    alter publication supabase_realtime
      add table public.vendor_messages;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;

commit;

select
  'vendor_chat_phase2_ready' as status;
