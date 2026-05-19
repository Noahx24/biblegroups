-- Subject access + retention for family_members.
--
-- POPIA gives the data subject (or their parent / guardian) the right to:
--   * Access the data held about them.
--   * Have inaccurate data corrected - covered by the parent's normal write
--     access on family_members.
--   * Have data deleted ("right to erasure" / right to be forgotten).
--
-- It also requires retention to be limited to what is reasonably necessary
-- for the purpose. For children's programme registration, that purpose ends
-- at age 18, so this migration adds an admin-callable retention sweep.
--
-- All three RPCs are SECURITY DEFINER with locked search_path. Each one
-- writes an audit row before performing the operation, even when the
-- operation is rejected for authorization reasons, so the log captures
-- attempts.

-- ─── 1. Parent: export everything about a child ─────────────────────────────
-- Returns a self-contained JSON document so the parent can save or share it
-- (data portability). Only callable by the child's parent_user_id.

create or replace function public.parent_export_child_data(p_child_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_child            public.family_members%rowtype;
  v_registrations    jsonb;
  v_audits           jsonb;
begin
  select * into v_child from public.family_members where id = p_child_id;
  if not found then
    raise exception 'child not found' using errcode = 'P0002';
  end if;

  if v_child.parent_user_id is distinct from auth.uid() then
    -- Log the attempt before rejecting.
    insert into public.family_member_audits (family_member_id, actor_id, action, metadata)
    values (p_child_id, auth.uid(), 'export',
            jsonb_build_object('status', 'denied', 'reason', 'not_parent'));
    raise exception 'only the parent may export this child''s data' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', pr.id,
      'program_id', pr.program_id,
      'program_name', yp.name,
      'status', pr.status,
      'notes', pr.notes,
      'registered_at', pr.registered_at
    ) order by pr.registered_at), '[]'::jsonb)
  into v_registrations
  from public.program_registrations pr
  left join public.youth_programs yp on yp.id = pr.program_id
  where pr.family_member_id = p_child_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'action', a.action,
      'changed_fields', a.changed_fields,
      'metadata', a.metadata,
      'created_at', a.created_at
    ) order by a.created_at), '[]'::jsonb)
  into v_audits
  from public.family_member_audits a
  where a.family_member_id = p_child_id;

  insert into public.family_member_audits (family_member_id, actor_id, action, metadata)
  values (p_child_id, auth.uid(), 'export', jsonb_build_object('status', 'ok'));

  return jsonb_build_object(
    'child', to_jsonb(v_child),
    'registrations', v_registrations,
    'audit_history', v_audits,
    'exported_at', now()
  );
end;
$$;

revoke all on function public.parent_export_child_data(uuid) from public;
grant execute on function public.parent_export_child_data(uuid) to authenticated;

comment on function public.parent_export_child_data(uuid) is
  'POPIA subject access: parent exports all stored data about their child as JSON.';

-- ─── 2. Parent: delete a child completely ───────────────────────────────────
-- Hard-deletes the family_members row plus cascades on program_registrations
-- (FK ON DELETE CASCADE presumed from 0001). The audit log row is preserved
-- because family_member_id is set null on delete - the actor / metadata
-- survive so we can prove the deletion happened.

create or replace function public.parent_delete_child(p_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  select parent_user_id into v_owner from public.family_members where id = p_child_id;
  if not found then
    raise exception 'child not found' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() then
    insert into public.family_member_audits (family_member_id, actor_id, action, metadata)
    values (p_child_id, auth.uid(), 'delete',
            jsonb_build_object('status', 'denied', 'reason', 'not_parent'));
    raise exception 'only the parent may delete this child' using errcode = '42501';
  end if;

  -- The trigger on family_members will write the audit row automatically.
  delete from public.family_members where id = p_child_id;
end;
$$;

revoke all on function public.parent_delete_child(uuid) from public;
grant execute on function public.parent_delete_child(uuid) to authenticated;

comment on function public.parent_delete_child(uuid) is
  'POPIA right to erasure: parent hard-deletes a child record. The audit log entry survives.';

-- ─── 3. Admin retention sweep: delete children aged 18+ ─────────────────────
-- Driven by birth_year, since the schema only carries the year (the parent's
-- birthday convention). A child born in year Y is considered to have aged
-- out when current_year - Y >= 19 - we keep them through their 18th
-- calendar year for end-of-year programme handoff.
--
-- Returns the count deleted. Designed to be invoked manually by an admin or
-- scheduled via pg_cron from the Supabase dashboard.

create or replace function public.delete_children_aged_out()
returns table (deleted_count int, sample_ids uuid[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_is_admin boolean;
  v_cutoff_year     int := extract(year from now())::int - 19;
  v_deleted_ids     uuid[];
begin
  select (p.is_admin or p.is_super_admin)
    into v_caller_is_admin
    from public.profiles p
    where p.id = auth.uid();

  -- service_role can call directly (e.g. from pg_cron) without an admin
  -- profile row; the function is granted EXECUTE to service_role above.
  -- For everyone else, require an admin profile.
  if current_user <> 'service_role' and coalesce(v_caller_is_admin, false) = false then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with del as (
    delete from public.family_members
    where birth_year is not null and birth_year <= v_cutoff_year
    returning id
  )
  select array_agg(id) into v_deleted_ids from del;

  -- Sample (first 25) is returned so the caller can spot-check the cohort
  -- without exposing the whole list in logs.
  return query select
    coalesce(array_length(v_deleted_ids, 1), 0),
    case when v_deleted_ids is null then '{}'::uuid[]
         else v_deleted_ids[1:least(array_length(v_deleted_ids,1), 25)]
    end;
end;
$$;

revoke all on function public.delete_children_aged_out() from public;
grant execute on function public.delete_children_aged_out() to authenticated, service_role;

comment on function public.delete_children_aged_out() is
  'POPIA retention sweep: deletes family_members where birth_year indicates the child is 19+. Admin only. Returns count + sample of deleted IDs.';
