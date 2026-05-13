-- 0005: RLS hardening + data-integrity constraints.
--
-- This migration tightens server-side guards so the database stays correct
-- even if the app layer is bypassed (direct Supabase JS calls with the anon
-- key, or app bugs that skip validation). Targets the findings from the QA
-- review:
--
--   B-49  events.starts_at had no future-date constraint server-side
--   B-54  handle_new_user trigger leaked the user's email prefix as the
--         default display_name, exposed to every signed-in member by
--         profiles_read_all
--   B-55  events.title had no non-empty constraint
--   B-56  profiles.display_name / favorite fields had no length cap
--
-- Re-running this migration is safe: every constraint is dropped before
-- being recreated and the trigger uses CREATE OR REPLACE.

-- Constraints on events ------------------------------------------------------

-- Title must contain at least one non-whitespace character. The app already
-- guards this, but a direct API call with the anon key could otherwise insert
-- '' or '   '.
alter table public.events drop constraint if exists events_title_not_empty;
alter table public.events
  add constraint events_title_not_empty
  check (length(trim(title)) > 0);

-- Sanity: event start times must be at or near the time the row is created.
-- A 7-day backdate window keeps existing rows valid and allows the rare
-- "I forgot to log last Sunday" use case without permitting arbitrary
-- historical inserts. The app enforces strictly-future for new events; this
-- only catches buggy or malicious clients.
alter table public.events drop constraint if exists events_starts_at_sane;
alter table public.events
  add constraint events_starts_at_sane
  check (starts_at > created_at - interval '7 days');

-- Length caps on profile text fields ----------------------------------------

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
  check (display_name is null or length(display_name) between 1 and 100);

alter table public.profiles drop constraint if exists profiles_favorite_verse_length;
alter table public.profiles
  add constraint profiles_favorite_verse_length
  check (favorite_verse is null or length(favorite_verse) <= 500);

alter table public.profiles drop constraint if exists profiles_favorite_hymn_length;
alter table public.profiles
  add constraint profiles_favorite_hymn_length
  check (favorite_hymn is null or length(favorite_hymn) <= 200);

-- Birthday sanity: must be on or after 1900-01-01 and not in the future.
-- Without this, a typo like 0202-04-15 silently saves and breaks date math.
alter table public.profiles drop constraint if exists profiles_birthday_sane;
alter table public.profiles
  add constraint profiles_birthday_sane
  check (
    birthday is null
    or (birthday >= date '1900-01-01' and birthday <= current_date)
  );

-- handle_new_user — stop leaking the email prefix as display_name -----------

-- Before: the COALESCE fallback was split_part(email, '@', 1), so signing up
-- with john.smith@gmail.com immediately made "john.smith" visible to every
-- other authenticated member via profiles_read_all. Now we default to NULL
-- and the UI shows "Member" until the user picks a name on the Profile tab.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The trigger itself is unchanged; recreated only for explicitness.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Clarifying comment on schedule_claim_self ---------------------------------
-- The policy is correct (USING prevents targeting another member's row, and
-- WITH CHECK constrains what leader_id can be set to) but the intent isn't
-- obvious. A COMMENT survives schema dumps so future maintainers see why.
comment on policy "schedule_claim_self" on public.schedule is
  'Members can claim an open slot (leader_id IS NULL) by setting leader_id '
  'to themselves, or release their own slot by setting leader_id NULL. The '
  'USING clause prevents targeting another member''s row in the first place.';
