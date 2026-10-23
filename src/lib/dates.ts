// Pure date helpers. ISO dates are 'YYYY-MM-DD' in LOCAL time. ISO strings sort
// lexically, so string comparison is a valid date comparison.

export type ISODate = string;

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

/** Whole days from a → b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

/** Number of days in the inclusive span [a, b]. */
export function spanDays(a: ISODate, b: ISODate): number {
  return daysBetween(a, b) + 1;
}

export function startOfMonth(iso: ISODate): ISODate {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Monday-start week. */
export function startOfWeek(iso: ISODate): ISODate {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return toISO(d);
}

export function startOfYear(iso: ISODate): ISODate {
  return `${parseISO(iso).getFullYear()}-01-01`;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}
export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}
export function inRange(d: ISODate, from: ISODate, to: ISODate): boolean {
  return d >= from && d <= to;
}

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export type RangePreset =
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'salary_cycle'
  | 'quarter'
  | 'year'
  | 'all'
  | 'custom';

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'salary_cycle', label: 'Salary cycle' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

/**
 * Resolve a preset to a concrete range. Current periods end TODAY (so the
 * as-of date is "now"); past periods end at their natural boundary.
 */
export function resolveRange(
  preset: RangePreset,
  opts: { today?: ISODate; salaryDay?: number; custom?: DateRange; earliest?: ISODate } = {}
): DateRange {
  const today = opts.today ?? todayISO();
  const salaryDay = opts.salaryDay ?? 11;

  switch (preset) {
    case 'this_week':
      return { from: startOfWeek(today), to: today };
    case 'this_month':
      return { from: startOfMonth(today), to: today };
    case 'last_month': {
      const lastMonthDay = addMonths(today, -1);
      return { from: startOfMonth(lastMonthDay), to: endOfMonth(lastMonthDay) };
    }
    case 'salary_cycle': {
      // The pay cycle containing today: from the salary day of this/last month
      // up to the day before the next salary day.
      const d = parseISO(today);
      const day = d.getDate();
      const cycleStartMonth = day >= salaryDay ? today : addMonths(today, -1);
      const sm = parseISO(cycleStartMonth);
      const from = toISO(new Date(sm.getFullYear(), sm.getMonth(), Math.min(salaryDay, 28)));
      return { from, to: today };
    }
    case 'quarter': {
      const d = parseISO(today);
      const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
      return { from: toISO(new Date(d.getFullYear(), qStartMonth, 1)), to: today };
    }
    case 'year':
      return { from: startOfYear(today), to: today };
    case 'all':
      return { from: opts.earliest ?? '2000-01-01', to: today };
    case 'custom':
      return opts.custom ?? { from: startOfMonth(today), to: today };
  }
}
