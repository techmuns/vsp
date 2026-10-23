import { describe, it, expect } from 'vitest';
import { nextOccurrence, occurrencesBetween, isMissed, isDue, describeSchedule } from '../recurring';
import { parseISO } from '../../lib/dates';
import type { Recurring } from '../../db/types';

describe('recurring schedules', () => {
  it('advances monthly schedules, strictly forward, clamping to short months', () => {
    expect(nextOccurrence('monthly:11', '2026-10-05')).toBe('2026-10-11');
    expect(nextOccurrence('monthly:11', '2026-10-11')).toBe('2026-11-11'); // strictly after
    expect(nextOccurrence('monthly:31', '2026-02-15')).toBe('2026-02-28'); // clamp Feb
  });

  it('handles daily / everyN / yearly', () => {
    expect(nextOccurrence('daily', '2026-10-23')).toBe('2026-10-24');
    expect(nextOccurrence('everyN:15', '2026-10-01')).toBe('2026-10-16');
    expect(nextOccurrence('yearly:12-25', '2026-10-01')).toBe('2026-12-25');
    expect(nextOccurrence('yearly:12-25', '2026-12-25')).toBe('2027-12-25');
  });

  it('weekly lands on the right weekday within a week', () => {
    const n = nextOccurrence('weekly:1', '2026-10-23'); // next Monday
    expect(parseISO(n).getDay()).toBe(1);
    expect(n > '2026-10-23').toBe(true);
  });

  it('lists occurrences in a window and detects missed/due', () => {
    const occ = occurrencesBetween('monthly:1', '2026-09-15', '2026-12-10');
    expect(occ).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
    const r = { active: true, nextDate: '2026-10-01' } as Recurring;
    expect(isMissed(r, '2026-10-23')).toBe(true);
    expect(isDue(r, '2026-10-23')).toBe(true);
    expect(isDue({ ...r, nextDate: '2026-11-01' } as Recurring, '2026-10-23')).toBe(false);
  });

  it('describes schedules in plain language', () => {
    expect(describeSchedule('monthly:11')).toBe('Monthly on the 11th');
    expect(describeSchedule('weekly:1')).toBe('Weekly on Monday');
  });
});
