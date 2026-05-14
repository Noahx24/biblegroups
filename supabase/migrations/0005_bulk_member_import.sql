-- Backend bulk member import.
--
-- Replaces the per-row, client-driven CSV import that previously lived in
-- AdminScreen with a single server-side RPC. The function:
--
--   * Runs as security definer, so admin staff can invoke it without needing
--     RLS bypass tokens — the guard inside checks profiles.is_admin /
--     is_super_admin against auth.uid().
--   * Accepts a jsonb array `[{ email, group_name, role }]`.
--   * Resolves each email -> profile, looks up or creates the named group,
--     and upserts the group_members row.
--   * Returns one row per input entry with status + message so the caller
--     can display per-row results without re-running the whole batch.
--
-- The RPC is intended to be invoked from the Supabase SQL editor, the
-- supabase-js admin script (scripts/bulk_import_members.ts), or any other
-- trusted backend tool — never from the public client UI.

create or replace function public.admin_bulk_assign_members(payload jsonb)
returns table (
  row_index int,
  email text,
  group_name text,
  role text,
  status text,
  message text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_is_admin boolean;
  entry jsonb;
  idx int := 0;
  v_email text;
  v_group_name text;
  v_role text;
  v_user_id uuid;
  v_group_id uuid;
  v_group_type text;
begin
  -- Admin guard. This is the only authorisation check the function needs
  -- because security definer otherwise gives the caller table-owner privileges.
  select (p.is_admin or p.is_super_admin)
    into caller_is_admin
    from public.profiles p
    where p.id = auth.uid();

  if coalesce(caller_is_admin, false) = false then
    raise exception 'admin_bulk_assign_members: caller is not an admin' using errcode = '42501';
  end if;

  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'admin_bulk_assign_members: payload must be a JSON array' using errcode = '22023';
  end if;

  for entry in select * from jsonb_array_elements(payload)
  loop
    idx := idx + 1;
    v_email := nullif(btrim(entry->>'email'), '');
    v_group_name := nullif(btrim(entry->>'group_name'), '');
    v_role := lower(coalesce(entry->>'role', 'member'));

    if v_role not in ('member', 'leader') then
      v_role := 'member';
    end if;

    if v_email is null or v_group_name is null then
      row_index := idx;
      email := v_email;
      group_name := v_group_name;
      role := v_role;
      status := 'error';
      message := 'email and group_name are both required';
      return next;
      continue;
    end if;

    -- 1. Resolve the user by email (case-insensitive). Profiles must already
    --    exist — this RPC does not create auth users.
    select p.id
      into v_user_id
      from public.profiles p
      where lower(p.email) = lower(v_email)
      limit 1;

    if v_user_id is null then
      row_index := idx;
      email := v_email;
      group_name := v_group_name;
      role := v_role;
      status := 'error';
      message := 'no user found with that email';
      return next;
      continue;
    end if;

    -- 2. Find or create the group. Names match case-insensitively. New groups
    --    default to 'volunteer' unless the name matches "Class N".
    select g.id
      into v_group_id
      from public.groups g
      where lower(g.name) = lower(v_group_name)
      limit 1;

    if v_group_id is null then
      v_group_type := case
        when v_group_name ~* '^class\s+\d+' then 'class'
        else 'volunteer'
      end;

      insert into public.groups (name, type, created_by)
      values (v_group_name, v_group_type, auth.uid())
      returning id into v_group_id;
    end if;

    -- 3. Upsert the membership. Volunteer-group leader rows are blocked by
    --    the trigger from migration 0003; trap that as a per-row error rather
    --    than aborting the whole batch.
    begin
      insert into public.group_members (group_id, user_id, role)
      values (v_group_id, v_user_id, v_role)
      on conflict (group_id, user_id)
        do update set role = excluded.role;

      row_index := idx;
      email := v_email;
      group_name := v_group_name;
      role := v_role;
      status := 'ok';
      message := 'upserted';
      return next;
    exception when others then
      row_index := idx;
      email := v_email;
      group_name := v_group_name;
      role := v_role;
      status := 'error';
      message := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

-- Lock down EXECUTE so the function is callable by admins via the
-- authenticated role (the guard inside still checks the JWT's user), and
-- by the service_role for backend scripts.
revoke all on function public.admin_bulk_assign_members(jsonb) from public;
grant execute on function public.admin_bulk_assign_members(jsonb) to authenticated, service_role;

comment on function public.admin_bulk_assign_members(jsonb) is
  'Bulk import of group memberships. Payload: [{email, group_name, role}]. '
  'Returns one row per input with status (ok | error) and a message. '
  'Admin-only. See scripts/bulk_import_members.ts for an example invocation.';
