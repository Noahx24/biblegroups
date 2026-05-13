-- 0004: Enable Supabase Realtime on shared-state tables.
--
-- Realtime works by replicating writes from a Postgres logical-replication
-- publication called supabase_realtime. The supabase project ships with that
-- publication empty by default, so the app's postgres_changes subscriptions
-- never fire until a table is explicitly added.
--
-- We enable replication on every table the UI subscribes to. event_rsvps and
-- weekly_verses change frequently; schedule + events change occasionally;
-- profiles is included so role/leader toggles propagate live.

do $$
declare
  t text;
begin
  for t in
    select unnest(array['schedule', 'weekly_verses', 'events', 'event_rsvps', 'profiles'])
  loop
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
