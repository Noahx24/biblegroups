-- Volunteer programmes + slot time + push tokens.
--
-- Adds the data model needed for:
--   * Admins maintaining a per-volunteer-group catalogue of programmes
--     (e.g. "Friday Night Youth", "11:00 Service Children's Church").
--   * Schedule slots carrying a time-of-day plus the programme they
--     belong to, so volunteers know when and what they're scheduled for.
--   * Storing Expo push tokens per (user, device) so the daily reminder
--     edge function can push notifications to assignees.
--
-- Idempotent: each create uses if-not-exists / drop-then-recreate where
-- the object is owned solely by this migration.

-- ─── volunteer_programmes ────────────────────────────────────────────────────
create table if not exists public.volunteer_programmes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  default_time time,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists volunteer_programmes_group_id_idx
  on public.volunteer_programmes(group_id);

-- A programme name is unique per group (case-insensitive).
create unique index if not exists volunteer_programmes_group_name_unique
  on public.volunteer_programmes(group_id, lower(name));

alter table public.volunteer_programmes enable row level security;

drop policy if exists volunteer_programmes_read on public.volunteer_programmes;
create policy volunteer_programmes_read on public.volunteer_programmes
  for select using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = volunteer_programmes.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists volunteer_programmes_admin_write on public.volunteer_programmes;
create policy volunteer_programmes_admin_write on public.volunteer_programmes
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin or p.is_super_admin)
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin or p.is_super_admin)
    )
  );

-- ─── schedule additions ─────────────────────────────────────────────────────
-- slot_time is the time-of-day for the slot (nullable so existing class-group
-- rows that didn't carry a time still work). programme_id is nullable and
-- only meaningful for volunteer-group slots; class-group slots keep it null.
alter table public.schedule
  add column if not exists slot_time time,
  add column if not exists programme_id uuid references public.volunteer_programmes(id) on delete set null;

create index if not exists schedule_programme_id_idx on public.schedule(programme_id);

-- The earlier migrations carried a unique constraint on (group_id, slot_date)
-- so a class group couldn't have two entries on the same date. Volunteer
-- groups want multiple slots per day (11:00 service + 18:00 service), so
-- relax it to (group_id, slot_date, coalesce(slot_time, '00:00:00')). The
-- old constraint's name isn't known here - drop anything matching the old
-- column set defensively.
do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'schedule'
    and c.contype = 'u'
    and (
      select array_agg(att.attname order by att.attname)
      from unnest(c.conkey) as k(attnum)
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = k.attnum
    ) = array['group_id', 'slot_date'];
  if con_name is not null then
    execute format('alter table public.schedule drop constraint %I', con_name);
  end if;
end$$;

-- New unique index: same date+time can't be double-booked within a group.
create unique index if not exists schedule_group_date_time_unique
  on public.schedule(group_id, slot_date, coalesce(slot_time, time '00:00:00'));

-- ─── device_push_tokens ─────────────────────────────────────────────────────
-- One row per (user, push_token). A user can have several tokens - multiple
-- devices, plus token rotation by Expo. The reminder edge function fans out
-- to all of them.
create table if not exists public.device_push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

create index if not exists device_push_tokens_user_id_idx
  on public.device_push_tokens(user_id);

alter table public.device_push_tokens enable row level security;

drop policy if exists device_push_tokens_owner on public.device_push_tokens;
create policy device_push_tokens_owner on public.device_push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Service role (used by the reminder edge function) bypasses RLS via the
-- service key - no extra policy needed for the function's SELECT.
