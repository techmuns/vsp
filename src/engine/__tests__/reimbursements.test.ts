import { describe, it, expect } from 'vitest';
import { buildClaimableLines, claimBatchTotal, claimableForTxn, mergeClaimLinesByDayCategory, type ClaimableLine } from '../reimbursements';
import { FULL_YEAR, input, policy, R, txn } from './_helpers';

const policies = [policy({ name: 'Office travel', matchPurposeId: 'office', percent: 50 })];

describe('reimbursement claim math', () => {
  it('claims the policy percent of a reimbursable office expense', () => {
    const t = txn({ type: 'expense', amountPaise: R(1200), accountId: 'bank', categoryId: 'transport', purposeId: 'office', reimbursable: true });
    expect(claimableForTxn(t, [], policies)).toEqual({ grossPaise: R(1200), claimablePaise: R(600) });
  });

  it('respects a manual override: a non-reimbursable trip in the same purpose is not claimed', () => {
    const t = txn({ type: 'expense', amountPaise: R(1200), accountId: 'bank', categoryId: 'transport', purposeId: 'office', reimbursable: false });
    expect(claimableForTxn(t, [], policies)).toEqual({ grossPaise: 0, claimablePaise: 0 });
  });

  it('honours a per-claim cap', () => {
    const capped = [policy({ name: 'Capped', matchPurposeId: 'office', percent: 50, maxPaise: R(500) })];
    const t = txn({ type: 'expense', amountPaise: R(1200), accountId: 'bank', purposeId: 'office', reimbursable: true });
    expect(claimableForTxn(t, [], capped).claimablePaise).toBe(R(500));
  });

  it('builds claimable lines and totals a batch with excludes and overrides', () => {
    const a = txn({ id: 'a', type: 'expense', amountPaise: R(1200), accountId: 'bank', purposeId: 'office', reimbursable: true, date: '2026-10-02' });
    const b = txn({ id: 'b', type: 'expense', amountPaise: R(800), accountId: 'bank', purposeId: 'office', reimbursable: true, date: '2026-10-09' });
    const c = txn({ id: 'c', type: 'expense', amountPaise: R(500), accountId: 'bank', description: 'groceries' }); // not reimbursable
    const lines = buildClaimableLines(input({ transactions: [a, b, c], policies }), FULL_YEAR);

    expect(lines.map((l) => l.txnId)).toEqual(['b', 'a']); // newest first
    expect(lines.find((l) => l.txnId === 'a')!.claimablePaise).toBe(R(600));
    expect(claimBatchTotal(lines)).toBe(R(1000)); // 600 + 400
    expect(claimBatchTotal(lines, { excludeIds: new Set(['a']) })).toBe(R(400));
    expect(claimBatchTotal(lines, { overrides: { a: R(100) } })).toBe(R(500)); // 100 + 400
  });

  it('never claims a friend’s share of a shared expense', () => {
    const t = txn({ type: 'shared_expense', amountPaise: R(2000), accountId: 'bank', purposeId: 'office' });
    const splits = [
      { id: 's1', txnId: t.id, amountPaise: R(800), personId: 'friend' },
      { id: 's2', txnId: t.id, amountPaise: R(1200), reimbursable: true },
    ];
    expect(claimableForTxn(t, splits, policies)).toEqual({ grossPaise: R(1200), claimablePaise: R(600) });
  });
});

describe('mergeClaimLinesByDayCategory (HR copy grouping)', () => {
  const cl = (over: Partial<ClaimableLine>): ClaimableLine => ({ txnId: Math.random().toString(36).slice(2), date: '2026-10-16', description: '', categoryId: 'commute', grossPaise: 0, claimablePaise: 0, ...over });

  it('merges repeated category on the same day (via the full claimable path), summing GROSS', () => {
    const a = txn({ id: 'a', type: 'expense', amountPaise: R(86), accountId: 'bank', categoryId: 'commute', purposeId: 'office', reimbursable: true, date: '2026-10-16' });
    const b = txn({ id: 'b', type: 'expense', amountPaise: R(160), accountId: 'bank', categoryId: 'commute', purposeId: 'office', reimbursable: true, date: '2026-10-16' });
    const lunch = txn({ id: 'c', type: 'expense', amountPaise: R(227), accountId: 'bank', categoryId: 'lunch', purposeId: 'office', reimbursable: true, date: '2026-10-16' });
    const prev = txn({ id: 'd', type: 'expense', amountPaise: R(86), accountId: 'bank', categoryId: 'commute', purposeId: 'office', reimbursable: true, date: '2026-10-15' });
    const merged = mergeClaimLinesByDayCategory(buildClaimableLines(input({ transactions: [a, b, lunch, prev], policies }), FULL_YEAR));
    expect(merged).toEqual([
      { date: '2026-10-16', categoryId: 'commute', grossPaise: R(246) }, // 86 + 160 merged
      { date: '2026-10-16', categoryId: 'lunch', grossPaise: R(227) },
      { date: '2026-10-15', categoryId: 'commute', grossPaise: R(86) },
    ]);
  });

  it('keeps different categories/days apart and preserves first-seen order', () => {
    const out = mergeClaimLinesByDayCategory([
      cl({ date: '2026-10-16', categoryId: 'lunch', grossPaise: R(227) }),
      cl({ date: '2026-10-16', categoryId: 'commute', grossPaise: R(86) }),
      cl({ date: '2026-10-16', categoryId: 'commute', grossPaise: R(160) }),
      cl({ date: '2026-10-15', categoryId: 'commute', grossPaise: R(86) }),
    ]);
    expect(out.map((g) => [g.date, g.categoryId, g.grossPaise])).toEqual([
      ['2026-10-16', 'lunch', R(227)],
      ['2026-10-16', 'commute', R(246)],
      ['2026-10-15', 'commute', R(86)],
    ]);
  });

  it('groups uncategorised lines together', () => {
    const out = mergeClaimLinesByDayCategory([cl({ categoryId: undefined, grossPaise: R(50) }), cl({ categoryId: undefined, grossPaise: R(30) })]);
    expect(out).toHaveLength(1);
    expect(out[0].grossPaise).toBe(R(80));
  });
});
