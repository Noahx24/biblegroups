-- 0002: Admins are implicitly leaders.
--
-- The v1 schema gated every leader action (insert/delete/update schedule,
-- edit events, write weekly verses) on profiles.is_leader = true alone. An
-- admin bootstrapped via SQL with only is_admin = true could not write any
-- of these tables — surprising, and easy to hit if anyone toggles their own
-- is_leader off via the Manage Leaders panel. This migration recreates the
-- relevant policies so they also accept (is_admin = true).
--
-- A `public.is_leader_or_admin(uid)` SECURITY DEFINER helper is added so
-- future policies can stay terse and the role check is in one place.

create or replace function public.is_leader_or_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and (is_leader or is_admin)
  );
$$;

-- Weekly verses: leader-of-the-week OR any admin can write.
drop policy if exists "verses_write_week_leader" on public.weekly_verses;
create policy "verses_write_week_leader" on public.weekly_verses
  for all
  using (
    exists (
      select 1 from public.schedule s
      where s.week_start = weekly_verses.week_start
        and s.leader_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  )
  with check (
    exists (
      select 1 from public.schedule s
      where s.week_start = weekly_verses.week_start
        and s.leader_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );

-- Events: owner OR leader/admin can update/delete.
drop policy if exists "events_update_owner_or_leader" on public.events;
create policy "events_update_owner_or_leader" on public.events
  for update
  using (
    auth.uid() = created_by
    or public.is_leader_or_admin(auth.uid())
  );

drop policy if exists "events_delete_owner_or_leader" on public.events;
create policy "events_delete_owner_or_leader" on public.events
  for delete
  using (
    auth.uid() = created_by
    or public.is_leader_or_admin(auth.uid())
  );

-- Schedule: leader OR admin can add/remove/update dates.
drop policy if exists "schedule_insert_leader" on public.schedule;
create policy "schedule_insert_leader" on public.schedule
  for insert
  with check (public.is_leader_or_admin(auth.uid()));

drop policy if exists "schedule_delete_leader" on public.schedule;
create policy "schedule_delete_leader" on public.schedule
  for delete
  using (public.is_leader_or_admin(auth.uid()));

-- Tighten schedule_update_leader: previously `with check (true)` let a leader
-- silently steal another leader's claim. Now constrain to "open slot, your
-- own slot, OR admin override".
drop policy if exists "schedule_update_leader" on public.schedule;
create policy "schedule_update_leader" on public.schedule
  for update
  using (public.is_leader_or_admin(auth.uid()))
  with check (
    leader_id is null
    or leader_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
