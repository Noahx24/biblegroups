-- Enable Supabase Realtime for the tables the app subscribes to via useRealtime().
--
-- Why: Postgres only streams change events for tables that belong to the
-- `supabase_realtime` publication. Without this, `postgres_changes` never fires
-- and live updates silently fail — e.g. a volunteer assigned to a schedule slot
-- doesn't see the AssignmentBanner / My Week update until they manually refresh.
--
-- REPLICA IDENTITY FULL is set so Realtime ships the full old/new row image,
-- which it needs to apply RLS correctly to UPDATE/DELETE events (an assignment
-- is an UPDATE that flips assignee_id) and to emit complete DELETE payloads.
--
-- Realtime still honours RLS: a client only receives change events for rows its
-- SELECT policy already allows it to read.
--
-- This migration is idempotent — safe to re-run.

-- The publication exists by default on Supabase projects; create it if missing
-- (e.g. on a bare local Postgres) so the ALTERs below don't error.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  t text;
  realtime_tables text[] := array[
    'schedule',
    'group_members',
    'groups',
    'events',
    'event_rsvps',
    'announcements',
    'reading_plan',
    'weekly_verses',
    'profiles',
    'youth_programs',
    'program_registrations'
  ];
begin
  foreach t in array realtime_tables loop
    -- Skip tables that don't exist (schema is mid-restructure on this branch).
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      raise notice 'skipping %, table not found', t;
      continue;
    end if;

    -- Add to the realtime publication if not already a member.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;

    -- Full row image for reliable RLS-filtered UPDATE/DELETE events.
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
