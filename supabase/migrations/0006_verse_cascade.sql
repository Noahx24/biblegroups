-- 0006: weekly_verses.week_start → schedule.week_start ON DELETE CASCADE.
--
-- Before this migration, removing a schedule date left its weekly_verse row
-- orphaned. ThisWeekScreen reads the verse by date, not by schedule join, so
-- the orphan would either resurface (if a new entry was added for the same
-- date later) or sit permanently invisible until cleaned up in SQL.
--
-- The FK makes the relationship explicit: a verse exists only for a
-- scheduled week, and removing that scheduled week takes the verse with it.
--
-- The cascade respects the existing verses_write_week_leader RLS policy
-- (which already required a matching schedule row to insert a verse), so
-- this constraint can't reject any flow the app exposes today.

-- First clean up any orphans that pre-date the FK. Safe because verses
-- without a matching schedule entry can never have been visible / editable
-- through the app anyway.
delete from public.weekly_verses
where week_start not in (select week_start from public.schedule);

alter table public.weekly_verses
  drop constraint if exists weekly_verses_week_start_fkey;

alter table public.weekly_verses
  add constraint weekly_verses_week_start_fkey
  foreign key (week_start)
  references public.schedule(week_start)
  on delete cascade;
