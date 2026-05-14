import { formatWeek, nextWeekStart, weekStart } from '@/lib/week';

describe('weekStart', () => {
  it('returns the Sunday of the supplied date as YYYY-MM-DD', () => {
    // 2026-05-14 is a Thursday; Sunday of that week is 2026-05-10.
    expect(weekStart(new Date(2026, 4, 14))).toBe('2026-05-10');
  });

  it('returns the same date when the input is already a Sunday', () => {
    expect(weekStart(new Date(2026, 4, 10))).toBe('2026-05-10');
  });

  it('spans month boundaries correctly', () => {
    // 2026-04-30 (Thu) → Sunday of that week is 2026-04-26.
    expect(weekStart(new Date(2026, 3, 30))).toBe('2026-04-26');
  });
});

describe('nextWeekStart', () => {
  it('returns the Sunday after the current week (exclusive upper bound)', () => {
    // 2026-05-14 (Thu) → next Sunday is 2026-05-17.
    expect(nextWeekStart(new Date(2026, 4, 14))).toBe('2026-05-17');
  });

  it('is exactly 7 days after weekStart for the same input', () => {
    const d = new Date(2026, 4, 14);
    const a = new Date(weekStart(d));
    const b = new Date(nextWeekStart(d));
    expect((b.getTime() - a.getTime()) / 86_400_000).toBe(7);
  });
});

describe('formatWeek', () => {
  it('formats a YYYY-MM-DD string as "MMM d, yyyy"', () => {
    expect(formatWeek('2026-05-10')).toBe('May 10, 2026');
  });

  it('parses single-digit months and days without padding tricks', () => {
    expect(formatWeek('2026-01-05')).toBe('Jan 5, 2026');
  });
});
