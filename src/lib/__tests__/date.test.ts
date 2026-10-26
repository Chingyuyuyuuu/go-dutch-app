import {
  addDays,
  dayLabel,
  formatDate,
  isValidLocalDate,
  monthGrid,
  monthLabel,
  shiftMonth,
  startOfMonth,
  todayLocal,
} from '../date';

describe('local dates', () => {
  it('uses the local calendar day', () => {
    expect(todayLocal(new Date(2026, 9, 25, 23, 59))).toBe('2026-10-25');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('validates dates', () => {
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('26-1-1')).toBe(false);
  });

  it('finds month boundaries', () => {
    expect(startOfMonth('2026-10-25')).toBe('2026-10-01');
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});

describe('formatting', () => {
  it('formats dates per language', () => {
    expect(formatDate('2026-10-25', 'en')).toBe('25/10/2026');
    expect(formatDate('2026-10-25', 'zh')).toBe('2026/10/25');
  });

  it('labels day groups', () => {
    const today = '2026-10-25';
    expect(dayLabel('2026-10-25', today, 'en')).toBe('Today');
    expect(dayLabel('2026-10-24', today, 'zh')).toBe('昨天');
    expect(dayLabel('2026-10-22', today, 'en')).toBe('Thu 22/10/2026');
    expect(dayLabel('2026-10-22', today, 'zh')).toBe('2026/10/22（四）');
  });

  it('labels months', () => {
    expect(monthLabel(2026, 10, 'en')).toBe('October 2026');
    expect(monthLabel(2026, 10, 'zh')).toBe('2026 年 10 月');
  });

  it('builds a Sunday-first month grid', () => {
    const grid = monthGrid(2026, 10);
    // 1 October 2026 is a Thursday.
    expect(grid.slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']);
    expect(grid.filter(Boolean)).toHaveLength(31);
  });
});
