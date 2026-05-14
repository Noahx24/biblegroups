-- POPIA-compliant child records.
--
-- South Africa's Protection of Personal Information Act treats health and
-- safety details about minors as "special personal information" — collection
-- and processing requires explicit, recorded consent, plus appropriate
-- technical and organisational controls (lawful basis, least privilege,
-- audit log, retention limits, subject access).
--
-- This migration adds:
--   * Health and emergency-contact columns on family_members.
--   * A consent-tracking pair (timestamp + version of consent text).
--   * A CHECK constraint that refuses to store any health field without a
--     recorded consent — fails closed.
--   * An immutable audit log of every insert / update / delete (the
--     application also writes 'export' rows from the subject-access RPC).
--   * An RLS policy that lets group leaders read a child's row only while
--     the child has an active program_registration — access auto-revokes
--     when the registration is cancelled or the programme ends.
--
-- Not encrypted at the column level: pgsodium Transparent Column Encryption
-- has been deprecated by Supabase. At-rest encryption (whole-database), TLS,
-- strict RLS, and the audit log here meet POPIA's "appropriate, reasonable
-- technical and organisational measures" for our scale. If the church
-- requires column-level encryption later, layer it via pgcrypto + a key in
-- Supabase Vault, encrypting on write in an RPC and decrypting on read in a
-- view. Keep this comment in sync with that plan.

-- ─── 1. Schema additions ────────────────────────────────────────────────────

alter table public.family_members
  add column if not exists allergies                  text,
  add column if not exists medical_notes              text,
  add column if not exists emergency_contact_1_name   text,
  add column if not exists emergency_contact_1_phone  text,
  add column if not exists emergency_contact_2_name   text,
  add column if not exists emergency_contact_2_phone  text,
  add column if not exists consent_given_at           timestamptz,
  add column if not exists consent_version            text;

-- Length sanity for free-text. Phones intentionally loose — international
-- numbers vary; we just bound the column so it can't store unreasonably
-- long input.
alter table public.family_members
  drop constraint if exists family_members_allergies_len;
alter table public.family_members
  add  constraint family_members_allergies_len
       check (allergies is null or length(allergies) <= 1000);

alter table public.family_members
  drop constraint if exists family_members_medical_len;
alter table public.family_members
  add  constraint family_members_medical_len
       check (medical_notes is null or length(medical_notes) <= 2000);

alter table public.family_members
  drop constraint if exists family_members_ec1_phone_len;
alter table public.family_members
  add  constraint family_members_ec1_phone_len
       check (emergency_contact_1_phone is null or length(emergency_contact_1_phone) between 4 and 40);

alter table public.family_members
  drop constraint if exists family_members_ec2_phone_len;
alter table public.family_members
  add  constraint family_members_ec2_phone_len
       check (emergency_contact_2_phone is null or length(emergency_contact_2_phone) between 4 and 40);

-- Consent gate: any health / emergency field requires recorded consent.
-- "Fails closed" — a row can't carry sensitive data without a timestamp +
-- version, so the audit log can always tie data back to a consent record.
alter table public.family_members
  drop constraint if exists family_members_consent_required;
alter table public.family_members
  add  constraint family_members_consent_required
       check (
         (
           allergies is null
           and medical_notes is null
           and emergency_contact_1_name  is null
           and emergency_contact_1_phone is null
           and emergency_contact_2_name  is null
           and emergency_contact_2_phone is null
         ) or (
           consent_given_at is not null and consent_version is not null
         )
       );

comment on column public.family_members.allergies is
  'Special personal information (POPIA). Only collected with explicit parental consent, see consent_given_at.';
comment on column public.family_members.medical_notes is
  'Special personal information (POPIA). Only collected with explicit parental consent.';
comment on column public.family_members.consent_given_at is
  'Timestamp the parent ticked the consent box for storing health / emergency information about this child.';
comment on column public.family_members.consent_version is
  'Version identifier of the consent text the parent agreed to (e.g. "2026-01-popia-v1").';

-- ─── 2. Audit log ───────────────────────────────────────────────────────────

create table if not exists public.family_member_audits (
  id              uuid        primary key default gen_random_uuid(),
  family_member_id uuid       references public.family_members(id) on delete set null,
  actor_id        uuid        references auth.users(id) on delete set null,
  action          text        not null check (action in ('insert', 'update', 'delete', 'export', 'health_read')),
  changed_fields  text[],
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists family_member_audits_member_idx
  on public.family_member_audits(family_member_id);
create index if not exists family_member_audits_actor_idx
  on public.family_member_audits(actor_id);
create index if not exists family_member_audits_created_idx
  on public.family_member_audits(created_at desc);

alter table public.family_member_audits enable row level security;

-- Parents can read audit rows for their own children. Admins can read all.
-- Nobody can write to the audit log directly — it's populated by the trigger
-- below and by the subject-access RPC running as security definer.
drop policy if exists family_member_audits_read on public.family_member_audits;
create policy family_member_audits_read on public.family_member_audits
  for select using (
    exists (
      select 1 from public.family_members fm
      where fm.id = family_member_audits.family_member_id
        and fm.parent_user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin or p.is_super_admin)
    )
  );

-- ─── 3. Audit trigger ───────────────────────────────────────────────────────

create or replace function public.log_family_member_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed text[];
begin
  if tg_op = 'INSERT' then
    insert into public.family_member_audits (family_member_id, actor_id, action, metadata)
    values (new.id, auth.uid(), 'insert',
            jsonb_build_object(
              'has_health_data',
              (new.allergies is not null or new.medical_notes is not null
               or new.emergency_contact_1_name is not null or new.emergency_contact_2_name is not null),
              'consent_version', new.consent_version
            ));
    return new;

  elsif tg_op = 'UPDATE' then
    changed := array[]::text[];
    -- parent_user_id changes are a child-transfer event — always log.
    if new.parent_user_id is distinct from old.parent_user_id then changed := changed || 'parent_user_id'; end if;
    if new.name is distinct from old.name then changed := changed || 'name'; end if;
    if new.birth_year is distinct from old.birth_year then changed := changed || 'birth_year'; end if;
    if new.allergies is distinct from old.allergies then changed := changed || 'allergies'; end if;
    if new.medical_notes is distinct from old.medical_notes then changed := changed || 'medical_notes'; end if;
    if new.emergency_contact_1_name  is distinct from old.emergency_contact_1_name  then changed := changed || 'emergency_contact_1_name';  end if;
    if new.emergency_contact_1_phone is distinct from old.emergency_contact_1_phone then changed := changed || 'emergency_contact_1_phone'; end if;
    if new.emergency_contact_2_name  is distinct from old.emergency_contact_2_name  then changed := changed || 'emergency_contact_2_name';  end if;
    if new.emergency_contact_2_phone is distinct from old.emergency_contact_2_phone then changed := changed || 'emergency_contact_2_phone'; end if;
    if new.consent_given_at is distinct from old.consent_given_at then changed := changed || 'consent_given_at'; end if;
    if new.consent_version  is distinct from old.consent_version  then changed := changed || 'consent_version';  end if;

    -- Skip if nothing meaningful changed (e.g. parent_user_id update only).
    if array_length(changed, 1) is null then
      return new;
    end if;

    insert into public.family_member_audits (family_member_id, actor_id, action, changed_fields)
    values (new.id, auth.uid(), 'update', changed);
    return new;

  elsif tg_op = 'DELETE' then
    -- family_member_id MUST be null here. AFTER DELETE fires after the row
    -- is gone AND after the ON DELETE SET NULL cascade has nulled existing
    -- audit references. Setting family_member_id = old.id on the new audit
    -- row would point at a non-existent family_members.id and fail the FK
    -- check at end-of-statement, breaking every delete. Carry the deleted
    -- child's id in metadata so admins can still trace the action.
    insert into public.family_member_audits (family_member_id, actor_id, action, metadata)
    values (null, auth.uid(), 'delete',
            jsonb_build_object(
              'child_id', old.id,
              'child_name', old.name,
              'birth_year', old.birth_year
            ));
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists log_family_member_change on public.family_members;
create trigger log_family_member_change
  after insert or update or delete on public.family_members
  for each row execute function public.log_family_member_change();

-- ─── 4. RLS: parent + active-registration leader reads ─────────────────────
-- Migration 0001 is expected to grant parents full access to their own
-- children. The parent policy here is idempotent — if 0001 already created
-- it under a different name, this one is harmless additional permission.
--
-- The leaders policy grants role='leader' in *any* group read access while
-- the child has at least one active program_registration. This is broader
-- than ideal — the schema has no programme-leader link, so we can't scope
-- by programme. Tighten this when programme-leader assignments land
-- (insert a join from program_registrations -> programme-leader table here).
-- Admins always bypass via the OR clause.

drop policy if exists family_members_parent_read on public.family_members;
create policy family_members_parent_read on public.family_members
  for select using (parent_user_id = auth.uid());

drop policy if exists family_members_leaders_read on public.family_members;
create policy family_members_leaders_read on public.family_members
  for select using (
    exists (
      select 1
      from public.group_members gm
      join public.program_registrations pr on pr.family_member_id = family_members.id
      where gm.user_id = auth.uid()
        and gm.role   = 'leader'
        and pr.status = 'active'
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin or p.is_super_admin)
    )
  );
