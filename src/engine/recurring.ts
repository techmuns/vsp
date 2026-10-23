import type { Recurring } from '../db/types';
import { addDays, parseISO, toISO, type ISODate } from '../lib/dates';

// Schedule strings (compact, serialisable):
//   'daily'          every day
//   'weekly:D'       weekly on weekday D (0 = Sunday … 6 = Saturday)
//   'monthly:DD'     monthly on day DD (clamped to the month's last day)
//   'yearly:MM-DD'   yearly on that month/day
//   'everyN:N'       every N days

export interface ParsedSchedule {
  kind: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'everyN';
  weekday?: number;
  day?: number;
  month?: number;
  n?: number;
}

export function parseSchedule(s: string): ParsedSchedule {
  const [kind, val] = s.split(':');
  if (kind === 'weekly') return { kind: 'weekly', weekday: Number(val) || 0 };
  if (kind === 'monthly') return { kind: 'monthly', day: Math.max(1, Math.min(31, Number(val) || 1)) };
  if (kind === 'yearly') {
    const [m, d] = (val ?? '01-01').split('-').map(Number);
    return { kind: 'yearly', month: m || 1, day: d || 1 };
  }
  if (kind === 'everyN') return { kind: 'everyN', n: Math.max(1, Number(val) || 1) };
  return { kind: 'daily' };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORD = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Plain-language description, e.g. "Monthly on the 11th". */
export function describeSchedule(s: string): string {
  const p = parseSchedule(s);
  switch (p.kind) {
    case 'daily': return 'Every day';
    case 'weekly': return `Weekly on ${WEEKDAYS[p.weekday ?? 0]}`;
    case 'monthly': return `Monthly on the ${ORD(p.day ?? 1)}`;
    case 'yearly': return `Yearly on ${p.day} ${MONTHS[(p.month ?? 1) - 1]}`;
    case 'everyN': return `Every ${p.n} days`;
  }
}

function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function dateInMonth(year: number, monthIdx: number, day: number): ISODate {
  return toISO(new Date(year, monthIdx, Math.min(day, daysInMonth(year, monthIdx))));
}

/** The next occurrence strictly AFTER `from`. */
export function nextOccurrence(schedule: string, from: ISODate): ISODate {
  const p = parseSchedule(schedule);
  const d = parseISO(from);
  switch (p.kind) {
    case 'daily':
      return addDays(from, 1);
    case 'everyN':
      return addDays(from, p.n ?? 1);
    case 'weekly': {
      let next = addDays(from, 1);
      for (let i = 0; i < 7; i++) {
        if (parseISO(next).getDay() === (p.weekday ?? 0)) return next;
        next = addDays(next, 1);
      }
      return next;
    }
    case 'monthly': {
      const day = p.day ?? 1;
      const thisMonth = dateInMonth(d.getFullYear(), d.getMonth(), day);
      if (thisMonth > from) return thisMonth;
      const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return dateInMonth(nm.getFullYear(), nm.getMonth(), day);
    }
    case 'yearly': {
      const m = (p.month ?? 1) - 1;
      const day = p.day ?? 1;
      const thisYear = dateInMonth(d.getFullYear(), m, day);
      if (thisYear > from) return thisYear;
      return dateInMonth(d.getFullYear() + 1, m, day);
    }
  }
}

/** Occurrences in (from, to]. */
export function occurrencesBetween(schedule: string, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = nextOccurrence(schedule, from);
  let guard = 0;
  while (cur <= to && guard++ < 2000) {
    out.push(cur);
    cur = nextOccurrence(schedule, cur);
  }
  return out;
}

/** A recurring item is "due" when its next date has arrived and not passed far. */
export function isDue(r: Recurring, today: ISODate): boolean {
  return r.active && r.nextDate <= today;
}

/** Overdue (next date already behind us) — a likely missed payment. */
export function isMissed(r: Recurring, today: ISODate): boolean {
  return r.active && r.nextDate < today;
}
