-- ChurchFlow — complete schema (single migration, fresh start).
-- Drop everything, then rebuild cleanly.
-- Run this once on a new Supabase project or after wiping the database.

-- ─── drop all existing objects ────────────────────────────────────────────────
drop trigger  if exists guard_profile_role         on public.profiles;
drop trigger  if exists enforce_one_class_group    on public.group_members;
drop trigger  if exists on_auth_user_created       on auth.users;
drop trigger  if exists on_auth_user_email_change  on auth.users;
drop function if exists public.guard_profile_role()        cascade;
drop function if exists public.enforce_one_class_group()   cascade;
drop function if exists public.handle_new_user()           cascade;
drop function if exists public.sync_profile_email()        cascade;
drop function if exists public.has_admin_role(uuid)        cascade;
drop function if exists public.is_leader_or_admin(uuid)    cascade;

drop table if exists public.program_registrations cascade;
drop table if exists public.youth_programs        cascade;
drop table if exists public.family_members        cascade;
drop table if exists public.announcements         cascade;
drop table if exists public.event_rsvps           cascade;
drop table if exists public.events                cascade;
drop table if exists public.weekly_verses         cascade;
drop table if exists public.schedule              cascade;
drop table if exists public.group_members         cascade;
drop table if exists public.groups                cascade;
drop table if exists public.profiles              cascade;

drop type if exists public.program_type        cascade;
drop type if exists public.registration_status cascade;
drop type if exists public.group_type          cascade;
drop type if exists public.member_role         cascade;
drop type if exists public.slot_status         cascade;
drop type if exists public.rsvp_status         cascade;

-- ─── enums ────────────────────────────────────────────────────────────────────
create type public.group_type          as enum ('class', 'volunteer');
create type public.member_role         as enum ('member', 'leader');
create type public.slot_status         as enum ('open', 'pending', 'accepted', 'declined');
create type public.rsvp_status         as enum ('going', 'not_going', 'maybe');
create type public.program_type        as enum ('youth', 'childrens', 'holiday_club');
create type public.registration_status as enum ('active', 'waitlisted', 'cancelled');

-- ─── profiles ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  email          text,
  display_name   text,
  avatar_url     text,
  favorite_verse text,
  favorite_hymn  text,
  birthday       date,
  is_admin       boolean not null default false,
  is_super_admin boolean not null default false,
  created_at     timestamptz not null default now(),

  constraint profiles_display_name_length
    check (display_name is null or length(display_name) between 1 and 100),
  constraint profiles_favorite_verse_length
    check (favorite_verse is null or length(favorite_verse) <= 500),
  constraint profiles_favorite_hymn_length
    check (favorite_hymn is null or length(favorite_hymn) <= 200),
  constraint profiles_birthday_sane
    check (birthday is null or (birthday >= date '1900-01-01' and birthday <= current_date))
);

create index profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

create policy "profiles_read_all" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles_update_admin" on public.profiles
  for update
  using  (public.has_admin_role(auth.uid()))
  with check (public.has_admin_role(auth.uid()));

-- Helper: true when the calling user is an admin OR super admin.
-- Used by all RLS policies so super admins automatically inherit admin access.
create or replace function public.has_admin_role(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = uid and (is_admin = true or is_super_admin = true)
  )
$$;

-- Guard: enforces role escalation rules.
--   • Only an admin or super admin can change is_admin on another row.
--   • Only a super admin can change is_super_admin on any row.
-- auth.uid() is null in the SQL editor / service-role key so the bootstrap
-- UPDATE (set is_admin = true) still works server-side.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Changing is_admin requires caller to be admin or super admin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not public.has_admin_role(auth.uid())
  then
    raise exception 'only admins can change is_admin';
  end if;

  -- Changing is_super_admin requires caller to be a super admin
  if new.is_super_admin is distinct from old.is_super_admin
     and auth.uid() is not null
     and not exists (
       select 1 from public.profiles where id = auth.uid() and is_super_admin = true
     )
  then
    raise exception 'only super admins can change is_super_admin';
  end if;

  return new;
end;
$$;

create trigger guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Auto-create profile on sign-up (email prefix NOT used to avoid leaking it).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when auth.users.email changes.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_change
  after insert or update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ─── groups ───────────────────────────────────────────────────────────────────
create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         public.group_type not null default 'class',
  description  text,
  meeting_time text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (name)
);

alter table public.groups enable row level security;

-- Insert/update/delete: admins only
create policy "admins_insert_groups" on public.groups
  for insert with check (
    public.has_admin_role(auth.uid())
  );

create policy "admins_update_groups" on public.groups
  for update using (
    public.has_admin_role(auth.uid())
  );

create policy "admins_delete_groups" on public.groups
  for delete using (
    public.has_admin_role(auth.uid())
  );

-- ─── group_members ────────────────────────────────────────────────────────────
-- NOTE: groups SELECT policy references this table, so it must be created first.
create table public.group_members (
  group_id  uuid not null references public.groups(id)   on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

-- All authenticated users can browse groups and see leaders (directory view).
create policy "all_authenticated_select_groups" on public.groups
  for select using (auth.uid() is not null);

create policy "all_authenticated_read_memberships" on public.group_members
  for select using (auth.uid() is not null);

create policy "admins_manage_memberships" on public.group_members
  for all using (
    public.has_admin_role(auth.uid())
  );

-- ─── weekly_verses ────────────────────────────────────────────────────────────
create table public.weekly_verses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  week_start  date not null,
  reference   text not null,
  text        text not null,
  translation text not null default 'WEB',
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (group_id, week_start)
);

alter table public.weekly_verses enable row level security;

create policy "group_members_select_verses" on public.weekly_verses
  for select using (
    auth.uid() in (select user_id from public.group_members where group_id = weekly_verses.group_id)
  );

create policy "leaders_manage_verses" on public.weekly_verses
  for all using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = weekly_verses.group_id and role = 'leader'
    )
    or public.has_admin_role(auth.uid())
  );

-- ─── schedule ─────────────────────────────────────────────────────────────────
create table public.schedule (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  slot_date   date not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  status      public.slot_status not null default 'open',
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (group_id, slot_date)
);

alter table public.schedule enable row level security;

create policy "group_members_select_schedule" on public.schedule
  for select using (
    auth.uid() in (select user_id from public.group_members where group_id = schedule.group_id)
  );

create policy "leaders_manage_schedule" on public.schedule
  for all using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = schedule.group_id and role = 'leader'
    )
    or public.has_admin_role(auth.uid())
  );

-- Members can claim an open slot for themselves.
create policy "members_claim_open_slot" on public.schedule
  for update using (
    auth.uid() in (select user_id from public.group_members where group_id = schedule.group_id)
    and status = 'open'
    and assignee_id is null
  )
  with check (assignee_id = auth.uid());

-- Assignee can accept or decline their own slot.
create policy "assignee_update_own_status" on public.schedule
  for update using (assignee_id = auth.uid())
  with check  (assignee_id = auth.uid());

-- ─── events ───────────────────────────────────────────────────────────────────
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  title       text not null,
  description text,
  location    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint events_title_not_empty check (length(trim(title)) > 0),
  constraint events_starts_at_sane  check (starts_at > created_at - interval '7 days')
);

alter table public.events enable row level security;

create policy "group_members_select_events" on public.events
  for select using (
    auth.uid() in (select user_id from public.group_members where group_id = events.group_id)
  );

create policy "members_insert_events" on public.events
  for insert with check (
    auth.uid() in (select user_id from public.group_members where group_id = events.group_id)
    and auth.uid() = created_by
  );

create policy "leaders_manage_events" on public.events
  for all using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = events.group_id and role = 'leader'
    )
    or public.has_admin_role(auth.uid())
    or auth.uid() = created_by
  );

-- ─── event_rsvps ──────────────────────────────────────────────────────────────
create table public.event_rsvps (
  event_id   uuid not null references public.events(id)   on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     public.rsvp_status not null default 'going',
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_rsvps enable row level security;

create policy "group_members_select_rsvps" on public.event_rsvps
  for select using (
    auth.uid() in (
      select gm.user_id from public.group_members gm
      join public.events e on e.group_id = gm.group_id
      where e.id = event_id
    )
  );

create policy "members_upsert_own_rsvp" on public.event_rsvps
  for all using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── announcements ────────────────────────────────────────────────────────────
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  title      text not null,
  body       text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy "group_members_select_announcements" on public.announcements
  for select using (
    auth.uid() in (select user_id from public.group_members where group_id = announcements.group_id)
  );

create policy "leaders_manage_announcements" on public.announcements
  for all using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = announcements.group_id and role = 'leader'
    )
    or public.has_admin_role(auth.uid())
  );

-- ─── family_members ───────────────────────────────────────────────────────────
create table public.family_members (
  id             uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references public.profiles(id) on delete cascade,
  name           text not null,
  birth_year     int,
  created_at     timestamptz not null default now()
);

alter table public.family_members enable row level security;

create policy "parents_manage_own_family" on public.family_members
  for all using  (parent_user_id = auth.uid())
  with check (parent_user_id = auth.uid());

create policy "admins_read_family" on public.family_members
  for select using (
    public.has_admin_role(auth.uid())
  );

-- ─── youth_programs ───────────────────────────────────────────────────────────
create table public.youth_programs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        public.program_type not null,
  description text,
  age_min     int,
  age_max     int,
  location    text,
  start_date  date,
  end_date    date,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint youth_programs_age_range check (age_min is null or age_max is null or age_min <= age_max)
);

alter table public.youth_programs enable row level security;

create policy "all_users_select_programs" on public.youth_programs
  for select using (auth.uid() is not null);

create policy "admins_manage_programs" on public.youth_programs
  for all using (
    public.has_admin_role(auth.uid())
  );

-- ─── program_registrations ────────────────────────────────────────────────────
create table public.program_registrations (
  id               uuid primary key default gen_random_uuid(),
  family_member_id uuid not null references public.family_members(id) on delete cascade,
  program_id       uuid not null references public.youth_programs(id)  on delete cascade,
  registered_by    uuid not null references public.profiles(id)        on delete cascade,
  status           public.registration_status not null default 'active',
  notes            text,
  registered_at    timestamptz not null default now(),
  unique (family_member_id, program_id)
);

alter table public.program_registrations enable row level security;

create policy "parents_manage_registrations" on public.program_registrations
  for all using  (registered_by = auth.uid())
  with check (registered_by = auth.uid());

create policy "admins_read_registrations" on public.program_registrations
  for select using (
    public.has_admin_role(auth.uid())
  );

-- ─── one-class-group constraint ──────────────────────────────────────────────
-- A user may belong to any number of volunteer groups but at most ONE class
-- group at a time. Enforced at the DB level so it holds regardless of whether
-- a member is added via CSV import, the app UI, or direct SQL.
create or replace function public.enforce_one_class_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select type from public.groups where id = new.group_id) = 'class' then
    if exists (
      select 1
      from   public.group_members gm
      join   public.groups        g  on g.id = gm.group_id
      where  gm.user_id   = new.user_id
        and  g.type        = 'class'
        and  gm.group_id  != new.group_id
    ) then
      raise exception 'A user can only belong to one class group at a time';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_one_class_group
  before insert or update on public.group_members
  for each row execute function public.enforce_one_class_group();

-- ─── avatar storage bucket ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "avatars_select_public" on storage.objects;
drop policy if exists "avatars_insert_own"    on storage.objects;
drop policy if exists "avatars_update_own"    on storage.objects;
drop policy if exists "avatars_delete_own"    on storage.objects;

create policy "avatars_select_public" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── realtime ─────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles', 'schedule', 'weekly_verses',
    'events', 'event_rsvps', 'announcements',
    'youth_programs', 'program_registrations'
  ]) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─── bootstrap note ───────────────────────────────────────────────────────────
-- After running this migration, sign in once, then grant yourself admin:
--   update public.profiles set is_admin = true where id = '<your-auth-uid>';
-- For CSV bulk-import also set:
--   update public.profiles set is_super_admin = true where id = '<your-auth-uid>';
