import { describe, it, expect } from 'vitest';
import { allocateSettlement, netBalance } from '../settlement';
import { R } from './_helpers';

const items = [
  { id: 'a', outstandingPaise: R(500) },
  { id: 'b', outstandingPaise: R(300) },
];

describe('settle-up allocation', () => {
  it('fills items oldest-first and tracks the remainder (partial across items)', () => {
    const r = allocateSettlement(items, R(600));
    expect(r.allocations).toEqual([
      { id: 'a', appliedPaise: R(500), remainingPaise: 0 },
      { id: 'b', appliedPaise: R(100), remainingPaise: R(200) },
    ]);
    expect(r.appliedPaise).toBe(R(600));
    expect(r.leftoverPaise).toBe(0);
  });

  it('an overpayment never over-fills an item — leftover is returned', () => {
    const r = allocateSettlement(items, R(1000));
    expect(r.allocations.every((a) => a.remainingPaise === 0)).toBe(true);
    expect(r.appliedPaise).toBe(R(800));
    expect(r.leftoverPaise).toBe(R(200));
  });

  it('a small payment only touches the first item (the rest stays owed)', () => {
    const r = allocateSettlement(items, R(200));
    expect(r.allocations[0]).toEqual({ id: 'a', appliedPaise: R(200), remainingPaise: R(300) });
    expect(r.allocations[1]).toEqual({ id: 'b', appliedPaise: 0, remainingPaise: R(300) });
  });

  it('nets a person’s receivable against what you owe them', () => {
    expect(netBalance(R(800), R(300))).toBe(R(500));
    expect(netBalance(R(200), R(900))).toBe(R(-700));
  });
});
