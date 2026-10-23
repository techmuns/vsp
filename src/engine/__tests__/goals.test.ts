import { describe, it, expect } from 'vitest';
import { goalProgress, goalAllocationConflicts } from '../goals';
import type { Goal } from '../../db/types';
import { R } from './_helpers';

const goal = (over: Partial<Goal>): Goal => ({ id: 'g', name: 'Goal', targetPaise: R(100000), active: true, createdAt: 0, updatedAt: 0, ...over });

describe('goal progress', () => {
  it('computes percentage and remaining', () => {
    const p = goalProgress(goal({ savedPaise: R(25000) }));
    expect(p.pct).toBeCloseTo(25, 5);
    expect(p.remainingPaise).toBe(R(75000));
    expect(p.onTrack).toBeNull();
  });

  it('judges on-track vs behind against the target date', () => {
    const base = goal({ targetDate: '2026-12-31' });
    const ahead = goalProgress({ ...base, savedPaise: R(60000) }, { startDate: '2026-01-01', today: '2026-07-01' });
    expect(ahead.onTrack).toBe(true); // ~50% elapsed, 60% saved
    const behind = goalProgress({ ...base, savedPaise: R(10000) }, { startDate: '2026-01-01', today: '2026-07-01' });
    expect(behind.onTrack).toBe(false);
  });

  it('prefers a passed-in linked balance over the stored savedPaise', () => {
    const p = goalProgress(goal({ savedPaise: R(1000) }), { savedPaise: R(40000) });
    expect(p.savedPaise).toBe(R(40000));
  });

  it('flags accounts linked to more than one goal (double-count risk)', () => {
    const goals = [goal({ id: 'a', linkedAccountIds: ['acc1', 'acc2'] }), goal({ id: 'b', linkedAccountIds: ['acc2'] })];
    expect(goalAllocationConflicts(goals)).toEqual(['acc2']);
  });
});
