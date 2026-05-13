-- 0003: Add birthday field to profiles.
--
-- Stored as a DATE (no timezone). Visible to all authenticated members
-- via the existing profiles_read_all policy so the class can celebrate
-- each other. Idempotent so re-running 0001 + 0002 + 0003 from scratch
-- on an existing project is safe.

alter table public.profiles
  add column if not exists birthday date;
