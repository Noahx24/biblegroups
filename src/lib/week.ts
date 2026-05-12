import { addDays, format, startOfWeek } from 'date-fns';

export function weekStart(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd');
}

// Exclusive: the Sunday after the current week. Use in range queries like
// week_start >= weekStart() AND week_start < nextWeekStart() to match any
// schedule entry that falls inside the current Sunday-Saturday window.
export function nextWeekStart(date: Date = new Date()): string {
  return format(addDays(startOfWeek(date, { weekStartsOn: 0 }), 7), 'yyyy-MM-dd');
}

export function formatWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'MMM d, yyyy');
}
