export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_leader: boolean;
};

export type WeeklyVerse = {
  id: string;
  week_start: string;
  reference: string;
  text: string;
  translation: string;
  note: string | null;
  created_by: string;
  created_at: string;
};

export type GroupEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  created_by: string;
  created_at: string;
};

export type ScheduleEntry = {
  week_start: string;
  leader_id: string | null;
  notes: string | null;
  leader?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};
