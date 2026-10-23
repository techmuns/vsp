import { describe, it, expect } from 'vitest';
import { eventBreakdown } from '../events';
import { summarizeLedger } from '../summarize';
import { FULL_YEAR, input, policy, R, split, txn } from './_helpers';

describe('event breakdown', () => {
  it('splits an event into paid / gross / net / recoverable / reimbursable', () => {
    const policies = [policy({ name: 'Office', matchPurposeId: 'office', percent: 50 })];
    const t1 = txn({ type: 'expense', amountPaise: R(2000), accountId: 'bank', eventId: 'trip', purposeId: 'office', reimbursable: true, categoryId: 'travel' });
    const t2 = txn({ type: 'shared_expense', amountPaise: R(1000), accountId: 'bank', eventId: 'trip' });
    const splits = [split(t2.id, { amountPaise: R(400), personId: 'friend' }), split(t2.id, { amountPaise: R(600), categoryId: 'food' })];

    const b = eventBreakdown(input({ transactions: [t1, t2], splits, policies }), FULL_YEAR);
    const trip = b['trip'];
    expect(trip.count).toBe(2);
    expect(trip.paidPaise).toBe(R(3000));
    expect(trip.grossPaise).toBe(R(2600)); // 2000 + 600
    expect(trip.netPersonalPaise).toBe(R(1600)); // (2000−1000) + 600
    expect(trip.recoverablePaise).toBe(R(400));
    expect(trip.reimbursablePaise).toBe(R(1000));
  });
});

describe('ledger summary', () => {
  it('sums in/out/net by transaction direction (transfers excluded)', () => {
    const s = summarizeLedger([
      txn({ type: 'income', amountPaise: R(50000), accountId: 'bank' }),
      txn({ type: 'expense', amountPaise: R(2000), accountId: 'bank' }),
      txn({ type: 'transfer', amountPaise: R(10000), accountId: 'bank', counterAccountId: 'broker' }),
      txn({ type: 'expense', amountPaise: R(500), accountId: 'bank', voided: true }),
    ]);
    expect(s.count).toBe(3); // voided excluded
    expect(s.moneyInPaise).toBe(R(50000));
    expect(s.moneyOutPaise).toBe(R(2000)); // transfer not counted
    expect(s.netPaise).toBe(R(48000));
  });
});
