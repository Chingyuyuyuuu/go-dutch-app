/**
 * Entry dates are local calendar days stored as "YYYY-MM-DD" strings, so they
 * never shift when a user changes time zone. "Today" uses the phone's time zone.
 */
export type LocalDate = string;

export type UiLang = 'en' | 'zh';

const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(year: number, month: number, day: number): LocalDate {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function dateFromJs(d: Date): LocalDate {
  return toLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function todayLocal(now: Date = new Date()): LocalDate {
  return dateFromJs(now);
}

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid local date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function isValidLocalDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { year, month, day } = parseLocalDate(date);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function toJs(date: LocalDate): Date {
  const { year, month, day } = parseLocalDate(date);
  return new Date(year, month - 1, day, 12);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = toJs(date);
  d.setDate(d.getDate() + days);
  return dateFromJs(d);
}

/**
 * Same day `months` later. A day that does not exist in the target month
 * becomes its last day (31 Jan + 1 month = 28 Feb), like PostgreSQL's date + interval.
 */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const target = shiftMonth(year, month, months);
  return toLocalDate(target.year, target.month, Math.min(day, daysInMonth(target.year, target.month)));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

export function weekday(date: LocalDate): number {
  return toJs(date).getDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** First day of the month containing `date`. */
export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date);
  return toLocalDate(year, month, 1);
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function isSameMonth(a: LocalDate, b: LocalDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** en-AU 25/10/2026, zh-TW 2026/10/25. */
export function formatDate(date: LocalDate, lang: UiLang): string {
  const { year, month, day } = parseLocalDate(date);
  return lang === 'zh' ? `${year}/${pad2(month)}/${pad2(day)}` : `${pad2(day)}/${pad2(month)}/${year}`;
}

/** Day group header: Today / Yesterday / "Thu 22/10/2026" / "2026/10/22（四）". */
export function dayLabel(date: LocalDate, today: LocalDate, lang: UiLang): string {
  if (date === today) return lang === 'zh' ? '今天' : 'Today';
  if (date === addDays(today, -1)) return lang === 'zh' ? '昨天' : 'Yesterday';
  const w = weekday(date);
  return lang === 'zh'
    ? `${formatDate(date, 'zh')}（${WEEKDAY_ZH[w]}）`
    : `${WEEKDAY_EN[w]} ${formatDate(date, 'en')}`;
}

/** "October" / "10 月"; short: "Oct" / "10 月". */
export function monthName(month: number, lang: UiLang, short = false): string {
  if (lang === 'zh') return `${month} 月`;
  const name = MONTH_EN[month - 1];
  return short ? name.slice(0, 3) : name;
}

/** "25/10" / "10/25", for short "next 25/10" hints. */
export function formatDayMonth(date: LocalDate, lang: UiLang): string {
  const { month, day } = parseLocalDate(date);
  return lang === 'zh' ? `${pad2(month)}/${pad2(day)}` : `${pad2(day)}/${pad2(month)}`;
}

/** "October 2026" / "2026 年 10 月". */
export function monthLabel(year: number, month: number, lang: UiLang): string {
  return lang === 'zh' ? `${year} 年 ${month} 月` : `${MONTH_EN[month - 1]} ${year}`;
}

export function weekHeader(lang: UiLang): string[] {
  return lang === 'zh' ? WEEKDAY_ZH : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
}

/** Calendar cells for a month grid starting on Sunday. `null` cells are leading blanks. */
export function monthGrid(year: number, month: number): (LocalDate | null)[] {
  const leading = new Date(year, month - 1, 1).getDay();
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => toLocalDate(year, month, i + 1));
  return [...Array<null>(leading).fill(null), ...days];
}
