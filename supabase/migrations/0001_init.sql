-- BibleGroups v1: single shared group, every signed-in user is a member.
-- Run this in the Supabase SQL editor on a fresh project.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  favorite_verse text,
  favorite_hymn text,
  is_leader boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Idempotent column adds for projects upgrading from an earlier run.
alter table public.profiles add column if not exists favorite_verse text;
alter table public.profiles add column if not exists favorite_hymn text;
alter table public.profiles add column if not exists is_admin boolean not null default false;

create table if not exists public.weekly_verses (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  reference text not null,
  text text not null,
  translation text not null,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.schedule (
  week_start date primary key,
  leader_id uuid references public.profiles(id) on delete set null,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- Auto-create a profile when a new auth.users row is inserted.
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
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-level security: every signed-in user can read everything; only leaders
-- can write verses/events/schedule. Anyone can edit their own profile.
alter table public.profiles enable row level security;
alter table public.weekly_verses enable row level security;
alter table public.events enable row level security;
alter table public.schedule enable row level security;
alter table public.event_rsvps enable row level security;

create policy "profiles_read_all" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Defense in depth: the profiles_update_self policy only re-checks row
-- ownership, so it would otherwise let a user set is_leader or is_admin on
-- their own row and bypass every leader-only policy below. This trigger
-- rejects any change to is_leader or is_admin unless the caller is already
-- an admin. auth.uid() is null in the SQL editor and for the service_role
-- key, so the admin bootstrap ("update profiles set is_admin = true ...")
-- still works server-side.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.is_leader is distinct from old.is_leader
       or new.is_admin is distinct from old.is_admin)
     and auth.uid() is not null
     and not exists (
       select 1 from public.profiles
       where id = auth.uid() and is_admin = true
     )
  then
    raise exception 'only admins can change is_leader or is_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

create policy "verses_read_all" on public.weekly_verses
  for select using (auth.role() = 'authenticated');

create policy "verses_write_leader" on public.weekly_verses
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_leader))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_leader));

-- Events: any signed-in member can create; only the creator (or any leader)
-- can edit or delete.
create policy "events_read_all" on public.events
  for select using (auth.role() = 'authenticated');

create policy "events_insert_self" on public.events
  for insert with check (auth.uid() = created_by);

create policy "events_update_owner_or_leader" on public.events
  for update
  using (
    auth.uid() = created_by
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_leader)
  );

create policy "events_delete_owner_or_leader" on public.events
  for delete
  using (
    auth.uid() = created_by
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_leader)
  );

-- Schedule: only leaders can add or remove dates. Any member can claim an
-- open slot (or release their own claim). Leaders can override anyone.
create policy "schedule_read_all" on public.schedule
  for select using (auth.role() = 'authenticated');

create policy "schedule_insert_leader" on public.schedule
  for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_leader));

create policy "schedule_delete_leader" on public.schedule
  for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_leader));

create policy "schedule_update_leader" on public.schedule
  for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_leader))
  with check (true);

create policy "schedule_claim_self" on public.schedule
  for update
  using (leader_id is null or leader_id = auth.uid())
  with check (leader_id is null or leader_id = auth.uid());

-- RSVPs: anyone can read; you can only insert/update/delete your own.
create policy "rsvps_read_all" on public.event_rsvps
  for select using (auth.role() = 'authenticated');

create policy "rsvps_write_self" on public.event_rsvps
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Bootstrap: after signing in once, run this in the SQL editor to grant
-- yourself admin (so you can promote group leaders from the app):
--   update public.profiles set is_admin = true where id = '<your-auth-uid>';
