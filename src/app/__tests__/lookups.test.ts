import { describe, it, expect } from 'vitest';
import { isOfficePurpose } from '../lookups';

describe('isOfficePurpose', () => {
  const purposes = [
    { id: 'office', name: 'Office' },
    { id: 'office_travel', name: 'Office travel' },
    { id: 'personal', name: 'Personal' },
  ];

  it('matches an Office purpose by name, case-insensitively', () => {
    expect(isOfficePurpose(purposes, 'office')).toBe(true);
    expect(isOfficePurpose(purposes, 'office_travel')).toBe(true); // substring match
    expect(isOfficePurpose([{ id: 'o', name: 'OFFICE' }], 'o')).toBe(true);
  });

  it('is false for non-office, unknown, or missing purposes', () => {
    expect(isOfficePurpose(purposes, 'personal')).toBe(false);
    expect(isOfficePurpose(purposes, 'nope')).toBe(false);
    expect(isOfficePurpose(purposes, '')).toBe(false);
    expect(isOfficePurpose(purposes, undefined)).toBe(false);
    expect(isOfficePurpose([], 'office')).toBe(false);
  });
});
