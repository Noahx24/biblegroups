import { format, startOfWeek } from 'date-fns';

export function weekStart(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd');
}

export function formatWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'MMM d, yyyy');
}
