-- Add location and meeting-mode to groups.
--
-- Three meeting modes:
--   in_person : physical gathering only
--   online    : video call only (location holds the URL)
--   hybrid    : both — location can be an address + a URL on a new line
--
-- Pre-existing groups are back-filled to 'in_person' (the original
-- assumption when the schema only had meeting_time). The mode is
-- defaulted on the column so new inserts that omit the field still
-- satisfy the check constraint.

alter table public.groups
  add column if not exists location     text,
  add column if not exists meeting_mode text;

update public.groups
   set meeting_mode = 'in_person'
 where meeting_mode is null;

alter table public.groups
  alter column meeting_mode set default 'in_person';

alter table public.groups
  drop constraint if exists groups_meeting_mode_valid;
alter table public.groups
  add  constraint groups_meeting_mode_valid
       check (meeting_mode in ('in_person', 'online', 'hybrid'));

alter table public.groups
  drop constraint if exists groups_location_len;
alter table public.groups
  add  constraint groups_location_len
       check (location is null or length(location) <= 500);

comment on column public.groups.location is
  'Free-text physical address for in-person groups, or a video-call URL for online groups. Up to 500 chars.';
comment on column public.groups.meeting_mode is
  'How the group meets: in_person, online, or hybrid.';
