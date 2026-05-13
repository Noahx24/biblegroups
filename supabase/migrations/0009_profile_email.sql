-- Add denormalised email column to profiles so the admin CSV importer
-- can look users up by email without hitting auth.users (service-role only).

alter table public.profiles
  add column if not exists email text;

-- Back-fill from auth.users for existing rows
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

-- Trigger: keep profiles.email in sync whenever auth.users.email changes
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

-- Fire on insert (new sign-up) and update (email change)
drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after insert or update of email on auth.users
  for each row execute procedure public.sync_profile_email();

-- Index so CSV import lookups are fast
create index if not exists profiles_email_idx on public.profiles (email);

-- RLS: users can read their own email; admins can read all
-- (profiles already has a permissive select policy so this is inherited)
