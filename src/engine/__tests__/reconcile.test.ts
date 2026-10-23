import { describe, it, expect } from 'vitest';
import { reconcile, type ParsedRow } from '../reconcile';
import { R, txn } from './_helpers';

describe('statement reconciliation', () => {
  it('matches a row to an existing transaction, and flags in-import duplicates', () => {
    const existing = [txn({ id: 't1', type: 'expense', amountPaise: R(500), accountId: 'bank', date: '2026-10-10', reference: 'UPI123' })];
    const rows: ParsedRow[] = [
      { date: '2026-10-11', description: 'Metro', amountPaise: R(-500), reference: 'UPI123' },
      { date: '2026-10-12', description: 'Coffee', amountPaise: R(-200) },
      { date: '2026-10-12', description: 'Coffee again', amountPaise: R(-200) },
    ];
    const res = reconcile(rows, existing, { accountId: 'bank' });
    expect(res.results[0]).toMatchObject({ status: 'matched', matchTxnId: 't1' });
    expect(res.results[1].status).toBe('new');
    expect(res.results[2].status).toBe('duplicate');
    expect(res.summary).toMatchObject({ matched: 1, newCount: 1, duplicates: 1 });
  });

  it('does not match an outflow row to an inflow transaction of the same amount', () => {
    const existing = [txn({ id: 'in1', type: 'income', amountPaise: R(500), accountId: 'bank', date: '2026-10-10' })];
    const rows: ParsedRow[] = [{ date: '2026-10-10', description: 'spend', amountPaise: R(-500) }];
    const res = reconcile(rows, existing, { accountId: 'bank' });
    expect(res.results[0].status).toBe('new');
  });

  it('verifies the running balance against the statement', () => {
    const rows: ParsedRow[] = [
      { date: '2026-10-01', description: 'Salary', amountPaise: R(50000), balancePaise: R(60000) },
      { date: '2026-10-02', description: 'Rent', amountPaise: R(-20000), balancePaise: R(40000) },
    ];
    const ok = reconcile(rows, [], { openingBalancePaise: R(10000), closingBalancePaise: R(40000) });
    expect(ok.balanceCheck).toMatchObject({ computedClosingPaise: R(40000), ok: true });
    expect(ok.summary.balanceMismatches).toBe(0);

    const bad = reconcile(
      [{ date: '2026-10-01', description: 'x', amountPaise: R(50000), balancePaise: R(99999) }],
      [],
      { openingBalancePaise: R(10000) }
    );
    expect(bad.results[0].balanceOk).toBe(false);
    expect(bad.summary.balanceMismatches).toBe(1);
  });
});
