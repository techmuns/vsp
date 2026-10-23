import { describe, it, expect } from 'vitest';
import { spendBreakdown } from '../breakdown';
import { FULL_YEAR, input, policy, R, txn } from './_helpers';

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

  it('a refund reduces its category’s net', () => {
    const buy = txn({ type: 'expense', amountPaise: R(3000), accountId: 'bank', categoryId: 'shopping', date: '2026-10-01' });
    const ref = txn({ type: 'refund', amountPaise: R(500), accountId: 'bank', categoryId: 'shopping', date: '2026-10-05' });
    const bd = spendBreakdown(input({ transactions: [buy, ref] }), FULL_YEAR);
    expect(bd.byCategory['shopping'].netPaise).toBe(R(2500));
    expect(bd.totalNetPaise).toBe(R(2500));
  });
});
