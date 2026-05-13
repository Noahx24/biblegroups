-- ChurchFlow clean-slate migration.
-- Drops all legacy single-group tables and rebuilds with a multi-group schema.
-- Run after 0006; safe to apply on a fresh project (all objects are IF NOT EXISTS / DROP … CASCADE).

-- ─── drop legacy tables ───────────────────────────────────────────────────────
drop table if exists public.event_rsvps   cascade;
drop table if exists public.events        cascade;
drop table if exists public.schedule      cascade;
drop table if exists public.weekly_verses cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups        cascade;

-- ─── enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.group_type      as enum ('class', 'volunteer');
  create type public.member_role     as enum ('member', 'leader');
  create type public.slot_status     as enum ('open', 'pending', 'accepted', 'declined');
  create type public.rsvp_status     as enum ('going', 'not_going', 'maybe');
exception when duplicate_object then null; end $$;

-- ─── profiles (keep existing, just ensure columns) ───────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- P1 fix: rewrite guard_profile_role to remove the is_leader reference before
-- dropping the column. The trigger exists from 0001_init.sql; if left unchanged
-- it references NEW.is_leader / OLD.is_leader and breaks every profile update
-- after the column is gone.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin)
     and auth.uid() is not null
     and not exists (
       select 1 from public.profiles where id = auth.uid() and is_admin = true
     )
  then
    raise exception 'only admins can change is_admin';
  end if;
  return new;
end;
$$;

-- drop legacy leader flag if it survived
alter table public.profiles
  drop column if exists is_leader;

-- ─── groups ──────────────────────────────────────────────────────────────────
create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         public.group_type not null default 'class',
  description  text,
  meeting_time text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.groups enable row level security;

-- P0 fix: members_select_own_groups references group_members which does not
-- exist yet at this point — it is created below. The policy is created after
-- the group_members table so the relation exists at compilation time.

create policy "admins_insert_groups" on public.groups
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

create policy "admins_update_groups" on public.groups
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

create policy "admins_delete_groups" on public.groups
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- ─── group_members ────────────────────────────────────────────────────────────
create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id)   on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

-- P0 fix: now that group_members exists, create the groups select policy that
-- references it. This must come after the table is defined.
create policy "members_select_own_groups" on public.groups
  for select using (
    auth.uid() in (
      select user_id from public.group_members where group_id = id
    )
    or exists (
      select 1 from public.profiles where id = auth.uid() and is_admin
    )
  );

create policy "members_select_own_memberships" on public.group_members
  for select using (
    auth.uid() = user_id
    or auth.uid() in (
      select user_id from public.group_members gm2
      where gm2.group_id = group_id
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

create policy "admins_manage_memberships" on public.group_members
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- ─── weekly_verses ────────────────────────────────────────────────────────────
create table if not exists public.weekly_verses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  week_start  date not null,
  reference   text not null,
  text        text not null,
  translation text not null default 'NIV',
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (group_id, week_start)
);

alter table public.weekly_verses enable row level security;

create policy "group_members_select_verses" on public.weekly_verses
  for select using (
    auth.uid() in (
      select user_id from public.group_members where group_id = weekly_verses.group_id
    )
  );

create policy "leaders_manage_verses" on public.weekly_verses
  for all using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = weekly_verses.group_id and role = 'leader'
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- ─── schedule ─────────────────────────────────────────────────────────────────
-- class groups:     assignee_id is the week's leader (self-claimed or admin-set)
-- volunteer groups: one row per slot; status tracks accept/decline
create table if not exists public.schedule (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  slot_date    date not null,
  assignee_id  uuid references public.profiles(id) on delete set null,
  status       public.slot_status not null default 'open',
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (group_id, slot_date)
);

alter table public.schedule enable row level security;

create policy "group_members_select_schedule" on public.schedule
  for select using (
    auth.uid() in (
      select user_id from public.group_members where group_id = schedule.group_id
    )
  );

-- leaders + admins can insert/update/delete
create policy "leaders_manage_schedule" on public.schedule
  for all using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = schedule.group_id and role = 'leader'
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- members can claim an open slot (set assignee_id on their own behalf)
create policy "members_claim_open_slot" on public.schedule
  for update using (
    auth.uid() in (
      select user_id from public.group_members where group_id = schedule.group_id
    )
    and status = 'open'
    and assignee_id is null
  )
  with check (assignee_id = auth.uid());

-- assignee can update their own slot status (accept / decline)
create policy "assignee_update_own_status" on public.schedule
  for update using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());

-- ─── events ───────────────────────────────────────────────────────────────────
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  title       text not null,
  description text,
  location    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "group_members_select_events" on public.events
  for select using (
    auth.uid() in (
      select user_id from public.group_members where group_id = events.group_id
    )
  );

create policy "leaders_manage_events" on public.events
  for all using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = events.group_id and role = 'leader'
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- ─── event_rsvps ─────────────────────────────────────────────────────────────
create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
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
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── announcements ───────────────────────────────────────────────────────────
create table if not exists public.announcements (
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
    auth.uid() in (
      select user_id from public.group_members where group_id = announcements.group_id
    )
  );

create policy "leaders_manage_announcements" on public.announcements
  for all using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = announcements.group_id and role = 'leader'
    )
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- ─── realtime ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.schedule;
alter publication supabase_realtime add table public.announcements;
alter publication supabase_realtime add table public.weekly_verses;
