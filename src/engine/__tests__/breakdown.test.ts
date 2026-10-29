import { describe, it, expect } from 'vitest';
import { spendBreakdown, txnGrossForPurpose } from '../breakdown';
import { FULL_YEAR, input, policy, R, split, txn } from './_helpers';

describe('spend breakdown', () => {
  it('splits spend by category, subcategory and purpose, net of reimbursements', () => {
    const policies = [policy({ name: 'Office', matchPurposeId: 'office', percent: 50 })];
    const office = txn({ type: 'expense', amountPaise: R(1000), accountId: 'bank', categoryId: 'transport', subcategoryId: 'cab', purposeId: 'office', reimbursable: true });
    const home = txn({ type: 'expense', amountPaise: R(2000), accountId: 'bank', categoryId: 'rent', purposeId: 'personal' });
    const bd = spendBreakdown(input({ transactions: [office, home], policies }), FULL_YEAR);

    expect(bd.byCategory['transport'].netPaise).toBe(R(500)); // 1000 − 50%
    expect(bd.byCategory['transport'].grossPaise).toBe(R(1000));
    expect(bd.byCategory['rent'].netPaise).toBe(R(2000));
    expect(bd.subByCategory['transport']['cab']).toBe(R(500));
    expect(bd.byPurpose['office']).toEqual({ grossPaise: R(1000), claimablePaise: R(500), netPaise: R(500) });
    expect(bd.byPurpose['personal'].netPaise).toBe(R(2000));
    expect(bd.totalNetPaise).toBe(R(2500));
  });

  it('a split expense counts only my own share under its purpose', () => {
    // A ₹4,000 trip, split ₹2,000 to a friend + ₹2,000 my personal share.
    const trip = txn({ type: 'expense', amountPaise: R(4000), accountId: 'bank', categoryId: 'travel', purposeId: 'personal' });
    const splits = [
      split(trip.id, { amountPaise: R(2000), personId: 'friend' }), // friend's share — excluded
      split(trip.id, { amountPaise: R(2000) }), // my share — inherits the txn's 'personal' purpose
    ];

    // The helper returns only MY ₹2,000, falling back to the txn's purpose.
    expect(txnGrossForPurpose(trip, splits, 'personal')).toBe(R(2000));
    expect(txnGrossForPurpose(trip, splits, 'personal')).toBeLessThan(trip.amountPaise);
    // Nothing lands under an unrelated purpose, and a txn with no splits is whole.
    expect(txnGrossForPurpose(trip, splits, 'office')).toBe(0);
    expect(txnGrossForPurpose(trip, [], 'personal')).toBe(R(4000));

    // …and the breakdown's purpose Gross agrees — the drill-down line matches the row.
    const bd = spendBreakdown(input({ transactions: [trip], splits }), FULL_YEAR);
    expect(bd.byPurpose['personal'].grossPaise).toBe(txnGrossForPurpose(trip, splits, 'personal'));
    expect(bd.byPurpose['personal'].grossPaise).toBe(R(2000));
  });

  it('a refund reduces its category’s net', () => {
    const buy = txn({ type: 'expense', amountPaise: R(3000), accountId: 'bank', categoryId: 'shopping', date: '2026-10-01' });
    const ref = txn({ type: 'refund', amountPaise: R(500), accountId: 'bank', categoryId: 'shopping', date: '2026-10-05' });
    const bd = spendBreakdown(input({ transactions: [buy, ref] }), FULL_YEAR);
    expect(bd.byCategory['shopping'].netPaise).toBe(R(2500));
    expect(bd.totalNetPaise).toBe(R(2500));
  });
});
