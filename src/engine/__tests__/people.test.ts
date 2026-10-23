import { describe, it, expect } from 'vitest';
import { openItems, personLedger, personPositions } from '../people';
import { input, R, split, txn } from './_helpers';

const ASOF = '2026-12-31';

describe('person ledger & open items', () => {
  it('runs a balance across lend / shared / repayment and nets the position', () => {
    const lent = txn({ id: 'l', type: 'lent', amountPaise: R(1000), accountId: 'bank', personId: 'f', date: '2026-09-01' });
    const dinner = txn({ id: 'd', type: 'shared_expense', amountPaise: R(2000), accountId: 'bank', personId: 'f', date: '2026-09-10' });
    const dsplits = [split('d', { amountPaise: R(800), personId: 'f' }), split('d', { amountPaise: R(1200), categoryId: 'food' })];
    const repay = txn({ id: 'r', type: 'loan_repayment_received', amountPaise: R(500), accountId: 'bank', personId: 'f', date: '2026-10-01' });

    const inp = input({ transactions: [lent, dinner, repay], splits: dsplits });
    const { entries, netPaise } = personLedger(inp, 'f', ASOF);

    expect(entries.map((e) => e.deltaPaise)).toEqual([R(1000), R(800), R(-500)]);
    expect(entries.map((e) => e.runningPaise)).toEqual([R(1000), R(1800), R(1300)]);
    expect(netPaise).toBe(R(1300));
    expect(personPositions(inp, ASOF)['f'].netPaise).toBe(R(1300));
  });

  it('applies repayments FIFO so each open item tracks its remaining', () => {
    const lent1 = txn({ id: 'a', type: 'lent', amountPaise: R(1000), accountId: 'bank', personId: 'f', date: '2026-09-01' });
    const lent2 = txn({ id: 'b', type: 'lent', amountPaise: R(600), accountId: 'bank', personId: 'f', date: '2026-09-05' });
    const repay = txn({ id: 'r', type: 'loan_repayment_received', amountPaise: R(1200), accountId: 'bank', personId: 'f', date: '2026-10-01' });

    const { entries } = personLedger(input({ transactions: [lent1, lent2, repay] }), 'f', ASOF);
    const open = openItems(entries);
    // 1200 clears the 1000 (a) fully and 200 of the 600 (b) → b has 400 left
    expect(open).toEqual([{ txnId: 'b', date: '2026-09-05', description: '', originalPaise: R(600), remainingPaise: R(400), dueDate: undefined }]);
  });
});
