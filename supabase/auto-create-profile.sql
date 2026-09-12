-- This replaces the old approach of creating a profile from the app.
-- Instead, the database itself automatically creates a profile the
-- moment a new account is created -- this avoids the timing/security
-- issue where the app tried to create a profile before the account
-- was fully confirmed.
--
-- SECURITY NOTE: only 'employee' and 'vendor' can ever be self-selected
-- or set via signup metadata. If someone sends 'ceo' or 'hr' (e.g. by
-- tampering with the signup request), it's downgraded to 'employee'
-- automatically -- those two roles must be set manually by an admin.
--
-- Per Sir's instruction: all accounts are now created from the backend
-- (no public signup form), so this trigger mainly matters for however
-- admin account-creation is done (Supabase dashboard or SQL).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'employee');
begin
  if requested_role not in ('employee', 'vendor') then
    requested_role := 'employee';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Employee'),
    requested_role
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
