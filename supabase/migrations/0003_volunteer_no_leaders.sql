-- Enforce members-only for volunteer groups.
--
-- Volunteer groups are managed by admins and have no concept of a "leader"
-- role — every participant is a member. This migration:
--   1. Backfills any existing role='leader' rows on volunteer groups to 'member'
--   2. Creates a BEFORE INSERT OR UPDATE trigger that raises an exception if
--      anyone tries to assign role='leader' on a volunteer group, so the rule
--      is enforced at the database level regardless of which client writes the row.

-- ─── backfill ────────────────────────────────────────────────────────────────
update public.group_members gm
set    role = 'member'
from   public.groups g
where  g.id   = gm.group_id
  and  g.type = 'volunteer'
  and  gm.role = 'leader';

-- ─── trigger function ────────────────────────────────────────────────────────
create or replace function public.guard_volunteer_member_role()
returns trigger language plpgsql as $$
begin
  if new.role = 'leader' then
    perform 1 from public.groups where id = new.group_id and type = 'volunteer';
    if found then
      raise exception
        'Volunteer groups cannot have leaders — use role ''member'' instead';
    end if;
  end if;
  return new;
end;
$$;

-- ─── trigger ─────────────────────────────────────────────────────────────────
drop trigger if exists guard_volunteer_member_role on public.group_members;
create trigger guard_volunteer_member_role
  before insert or update of role on public.group_members
  for each row execute function public.guard_volunteer_member_role();
