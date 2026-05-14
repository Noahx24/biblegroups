-- Drop the legacy profiles.birthday column.
--
-- Migration 0004 added birth_month / birth_day, back-filled them from the
-- existing birthday strings, and left the old column in place so older
-- mobile builds could still write to it during the rollout window. All
-- shipped clients now read and write birth_month / birth_day exclusively
-- (see ProfileScreen and ScheduleScreen), so the column is unused.
--
-- This is a one-way change. If a parent build of the app is still in the
-- field and tries to read profiles.birthday after this migration runs, the
-- select will fail. Confirm rollout coverage before applying.

alter table public.profiles
  drop column if exists birthday;
