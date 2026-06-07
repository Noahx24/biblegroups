// Consistent formatting for a group's meeting day + time.
//
// Groups carry a structured `meeting_day` (0 = Sunday … 6 = Saturday) and a
// `meeting_time` that, for groups created with the structured picker, holds an
// 'HH:MM' string. Older groups may still have free-text in meeting_time
// (e.g. "Sundays at 9 AM"); formatMeeting falls back to showing that verbatim
// so nothing is lost, while new groups render uniformly as "Wednesday 19:30".

export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Normalise an 'HH:MM' or 'HH:MM:SS' value to 'HH:MM'. Returns legacy/free
 *  text unchanged so we never hide data we can't parse. */
export function formatTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Render a group's meeting as a single consistent "Day HH:MM" string. */
export function formatMeeting(
  group: { meeting_day?: number | null; meeting_time?: string | null },
): string | null {
  const day =
    group.meeting_day != null && group.meeting_day >= 0 && group.meeting_day <= 6
      ? WEEKDAYS[group.meeting_day]
      : null;
  const time = formatTime(group.meeting_time ?? null);

  if (day && time) return `${day} ${time}`;
  if (day) return day;
  // No structured day — show whatever meeting_time held (a time, or legacy text).
  return group.meeting_time ?? null;
}
