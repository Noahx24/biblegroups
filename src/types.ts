export type GroupType = 'class' | 'volunteer';
export type MemberRole = 'member' | 'leader';
export type SlotStatus = 'open' | 'pending' | 'accepted' | 'declined';
export type RsvpStatus = 'going' | 'not_going' | 'maybe';
export type ProgramType = 'youth' | 'childrens' | 'holiday_club';
export type RegistrationStatus = 'active' | 'waitlisted' | 'cancelled';

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  favorite_verse: string | null;
  favorite_hymn: string | null;
  birthday: string | null;
  birth_month: number | null;
  birth_day: number | null;
  is_admin: boolean;
  is_super_admin: boolean;
  created_at: string;
};

export type FamilyMember = {
  id: string;
  parent_user_id: string;
  name: string;
  birth_year: number | null;
  // POPIA-classified special personal information. Only stored when
  // consent_given_at / consent_version are set (DB CHECK enforces this).
  allergies: string | null;
  medical_notes: string | null;
  emergency_contact_1_name: string | null;
  emergency_contact_1_phone: string | null;
  emergency_contact_2_name: string | null;
  emergency_contact_2_phone: string | null;
  consent_given_at: string | null;
  consent_version: string | null;
  created_at: string;
};

export const CHILD_CONSENT_VERSION = '2026-01-popia-v1';
export const CHILD_CONSENT_TEXT =
  'I am the parent or legal guardian of this child. I consent to ChurchFlow storing the health and ' +
  'emergency-contact details I provide here so that programme leaders can respond appropriately during ' +
  'church programmes my child attends. I understand I can view, export, or delete this information at ' +
  'any time, and that it will be automatically removed once my child turns 18.';

export type YouthProgram = {
  id: string;
  name: string;
  type: ProgramType;
  description: string | null;
  age_min: number | null;
  age_max: number | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type ProgramRegistration = {
  id: string;
  family_member_id: string;
  program_id: string;
  registered_by: string;
  status: RegistrationStatus;
  notes: string | null;
  registered_at: string;
  program?: YouthProgram | null;
  family_member?: FamilyMember | null;
};

export type Group = {
  id: string;
  name: string;
  type: GroupType;
  description: string | null;
  meeting_time: string | null;
  created_by: string | null;
  created_at: string;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};

export type WeeklyVerse = {
  id: string;
  group_id: string;
  week_start: string;
  reference: string;
  text: string;
  translation: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ScheduleSlot = {
  id: string;
  group_id: string;
  slot_date: string;
  slot_time: string | null;          // 'HH:MM:SS' or 'HH:MM'
  programme_id: string | null;
  assignee_id: string | null;
  status: SlotStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  assignee?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
  programme?: Pick<VolunteerProgramme, 'id' | 'name' | 'default_time'> | null;
};

export type VolunteerProgramme = {
  id: string;
  group_id: string;
  name: string;
  default_time: string | null;       // 'HH:MM:SS'
  created_by: string | null;
  created_at: string;
};

export type DevicePushToken = {
  user_id: string;
  expo_push_token: string;
  platform: 'ios' | 'android' | 'web';
  updated_at: string;
};

export type GroupEvent = {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type EventRsvp = {
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  updated_at: string;
};

export type Announcement = {
  id: string;
  group_id: string;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
  author?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};
