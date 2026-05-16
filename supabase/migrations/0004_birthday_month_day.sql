-- Replace the full birthday date column with month + day only (no year stored).
-- Year is intentionally not collected - users add their birthday, not date of birth.

alter table public.profiles
  add column if not exists birth_month smallint check (birth_month between 1 and 12),
  add column if not exists birth_day   smallint check (birth_day   between 1 and 31);

-- Back-fill from the existing birthday column where the stored value is a valid ISO date.
update public.profiles
  set birth_month = date_part('month', birthday::date)::smallint,
      birth_day   = date_part('day',   birthday::date)::smallint
  where birthday is not null
    and birthday ~ '^\d{4}-\d{2}-\d{2}$';

-- birthday column is retained here and will be dropped in the next schema cleanup
-- migration once all clients are on a build that no longer writes to it.
