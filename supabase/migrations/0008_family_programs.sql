-- Family members, youth/children programs, holiday clubs, and avatar storage.

-- ─── enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.program_type as enum ('youth', 'childrens', 'holiday_club');
  create type public.registration_status as enum ('active', 'waitlisted', 'cancelled');
exception when duplicate_object then null; end $$;

-- ─── avatar storage bucket ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Each user can read/write only their own avatar folder.
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

-- ─── family_members ───────────────────────────────────────────────────────────
create table if not exists public.family_members (
  id             uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references public.profiles(id) on delete cascade,
  name           text not null,
  birth_year     int,
  created_at     timestamptz not null default now()
);

alter table public.family_members enable row level security;

create policy "parents_manage_own_family" on public.family_members
  for all using (parent_user_id = auth.uid())
  with check (parent_user_id = auth.uid());

create policy "admins_read_family" on public.family_members
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- ─── youth_programs ───────────────────────────────────────────────────────────
create table if not exists public.youth_programs (
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
  created_at  timestamptz not null default now()
);

alter table public.youth_programs enable row level security;

-- All authenticated users can view active programs
create policy "all_users_select_programs" on public.youth_programs
  for select using (auth.uid() is not null);

-- Only admins can create/update/delete programs
create policy "admins_manage_programs" on public.youth_programs
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- ─── program_registrations ────────────────────────────────────────────────────
create table if not exists public.program_registrations (
  id               uuid primary key default gen_random_uuid(),
  family_member_id uuid not null references public.family_members(id) on delete cascade,
  program_id       uuid not null references public.youth_programs(id) on delete cascade,
  registered_by    uuid not null references public.profiles(id) on delete cascade,
  status           public.registration_status not null default 'active',
  notes            text,
  registered_at    timestamptz not null default now(),
  unique (family_member_id, program_id)
);

alter table public.program_registrations enable row level security;

-- Parents can see/manage registrations for their own family
create policy "parents_manage_registrations" on public.program_registrations
  for all using (registered_by = auth.uid())
  with check (registered_by = auth.uid());

-- Admins can see all registrations
create policy "admins_read_registrations" on public.program_registrations
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- ─── allow all authenticated users to browse groups ──────────────────────────
-- The existing members_select_own_groups policy in 0007 only shows groups the
-- user belongs to. We add a second policy so the directory view works.
drop policy if exists "all_authenticated_select_groups" on public.groups;
create policy "all_authenticated_select_groups" on public.groups
  for select using (auth.uid() is not null);

-- Allow all authenticated users to read group_members (for leader display)
drop policy if exists "all_authenticated_read_memberships" on public.group_members;
create policy "all_authenticated_read_memberships" on public.group_members
  for select using (auth.uid() is not null);

-- ─── super_admin flag on profiles ─────────────────────────────────────────────
-- A super admin can do everything a regular admin can, plus:
--   - bulk CSV import of members/leaders
--   - manage youth programs
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

-- ─── realtime ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.youth_programs;
alter publication supabase_realtime add table public.program_registrations;
