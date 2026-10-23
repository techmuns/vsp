import { describe, it, expect } from 'vitest';
import { budgetActual, budgetProgress } from '../budgets';
import { R } from './_helpers';

describe('budget vs actual', () => {
  it('is OK below 80%', () => {
    const p = budgetProgress(R(10000), R(4000));
    expect(p.pct).toBeCloseTo(40, 5);
    expect(p.remainingPaise).toBe(R(6000));
    expect(p.overPaise).toBe(0);
    expect(p.state).toBe('ok');
  });

  it('warns from 80% to 100%', () => {
    expect(budgetProgress(R(10000), R(8500)).state).toBe('warn');
    expect(budgetProgress(R(10000), R(10000)).state).toBe('warn');
  });

  it('flags over-budget with the overspend', () => {
    const p = budgetProgress(R(10000), R(12000));
    expect(p.state).toBe('over');
    expect(p.overPaise).toBe(R(2000));
    expect(p.remainingPaise).toBe(R(-2000));
  });

  it('pulls the right actual for each scope from engine figures', () => {
    const figures = { overallPaise: R(5000), byCategory: { food: R(1200) }, byEvent: { trip: R(900) } };
    expect(budgetActual({ scope: 'overall' }, figures)).toBe(R(5000));
    expect(budgetActual({ scope: 'category', refId: 'food' }, figures)).toBe(R(1200));
    expect(budgetActual({ scope: 'category', refId: 'missing' }, figures)).toBe(0);
    expect(budgetActual({ scope: 'event', refId: 'trip' }, figures)).toBe(R(900));
  });
});
