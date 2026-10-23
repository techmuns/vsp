// §7 reconciliation scenarios — a realistic multi-account, multi-month ledger,
// asserting the money-truth invariants that keep reports honest:
//   • loans are not income            • investments are not expense
//   • transfers are not double-counted • reimbursements don't inflate salary
//   • card payments don't duplicate the card purchase
//   • historical reports stay consistent, and adjustments don't leak into flows
import { describe, it, expect } from 'vitest';
import { acc, txn, inv, R, input, run, balOf } from './_helpers';
import type { EngineInput } from '../compute';
import type { DateRange } from '../../lib/dates';

const YEAR: DateRange = { from: '2026-01-01', to: '2026-12-31' };
const FEB: DateRange = { from: '2026-02-01', to: '2026-02-28' };

function scenario(withAdjustment = true): EngineInput {
  const accounts = [
    acc('HDFC', 'bank', R(100000)),
    acc('Cash', 'cash', R(5000)),
    acc('ICICI CC', 'credit_card', 0),
    acc('Zerodha', 'broker_cash', 0),
  ];
  const txns = [
    // ---- January
    txn({ type: 'income', amountPaise: R(80000), date: '2026-01-11', accountId: 'HDFC', categoryId: 'salary' }),
    txn({ type: 'expense', amountPaise: R(25000), date: '2026-01-05', accountId: 'HDFC', categoryId: 'rent' }),
    txn({ type: 'investment_buy', amountPaise: R(20000), date: '2026-01-15', accountId: 'HDFC', investmentId: 'NIFTY' }),
    txn({ type: 'transfer', amountPaise: R(10000), date: '2026-01-20', accountId: 'HDFC', counterAccountId: 'Cash' }),
    // ---- February
    txn({ type: 'income', amountPaise: R(80000), date: '2026-02-11', accountId: 'HDFC', categoryId: 'salary' }),
    txn({ type: 'cc_purchase', amountPaise: R(8000), date: '2026-02-14', accountId: 'ICICI CC', categoryId: 'shopping' }),
    txn({ type: 'lent', amountPaise: R(5000), date: '2026-02-18', accountId: 'HDFC', personId: 'Asha' }),
    txn({ type: 'reimbursement_receipt', amountPaise: R(3000), date: '2026-02-25', accountId: 'HDFC' }),
    // ---- March
    txn({ type: 'income', amountPaise: R(80000), date: '2026-03-11', accountId: 'HDFC', categoryId: 'salary' }),
    txn({ type: 'cc_repayment', amountPaise: R(8000), date: '2026-03-02', accountId: 'HDFC', counterAccountId: 'ICICI CC' }),
    txn({ type: 'loan_repayment_received', amountPaise: R(5000), date: '2026-03-20', accountId: 'HDFC', personId: 'Asha' }),
  ];
  if (withAdjustment) txns.push(txn({ type: 'adjustment', amountPaise: R(100), date: '2026-03-31', accountId: 'Cash' }));
  return input({ accounts, transactions: txns, investments: [inv('NIFTY')] });
}

describe('§7 multi-month reconciliation', () => {
  const snap = run(scenario(), YEAR);

  it('counts only real income — not loans, reimbursements or transfers', () => {
    // 3 × ₹80,000 salary. The ₹3,000 reimbursement receipt, the ₹5,000 loan
    // repayment and the ₹10,000 transfer are all excluded.
    expect(snap.incomePaise).toBe(R(240000));
  });

  it('keeps investments, transfers, card repayments and loans out of expense', () => {
    // rent ₹25,000 + card purchase ₹8,000 only.
    expect(snap.expensePaise).toBe(R(33000));
    expect(snap.grossExpensePaise).toBe(R(33000));
  });

  it('tracks an investment as invested money, never as spending', () => {
    expect(snap.investedPaise).toBe(R(20000));
    expect(snap.expenseByCategory['']).toBeUndefined(); // nothing fell through uncategorised
  });

  it('treats a reimbursement receipt as money back, not salary', () => {
    expect(snap.reimb.receivedPaise).toBe(R(3000));
  });

  it('nets lending against its repayment — a loan is never income', () => {
    expect(snap.totalReceivablePaise).toBe(0);
  });

  it('reconciles every account balance after transfers and card payments', () => {
    // HDFC: 100k +240k −25k −20k −10k −5k −8k +3k +5k = 280k
    expect(balOf(snap, 'HDFC')).toBe(R(280000));
    // Cash: 5k + 10k transfer + 100 adjustment
    expect(balOf(snap, 'Cash')).toBe(R(15100));
    // Card purchase −8k, repayment +8k → settled to zero (no duplicate expense)
    expect(balOf(snap, 'ICICI CC')).toBe(0);
    expect(snap.netWorthParts.cardPayablePaise).toBe(0);
  });

  it('sums bank + cash into available and net-worth parts correctly', () => {
    expect(snap.availablePaise).toBe(R(295100));
    expect(snap.netWorthParts.bankCashPaise).toBe(R(295100));
  });
});

describe('§7 historical consistency', () => {
  it('reports a past month from the same ledger without leakage', () => {
    const feb = run(scenario(), FEB);
    expect(feb.incomePaise).toBe(R(80000)); // Feb salary only
    expect(feb.expensePaise).toBe(R(8000)); // the card purchase only
  });

  it('is deterministic — the same input yields the same totals', () => {
    const a = run(scenario(), YEAR);
    const b = run(scenario(), YEAR);
    expect(b.incomePaise).toBe(a.incomePaise);
    expect(b.expensePaise).toBe(a.expensePaise);
    expect(b.netWorthPaise).toBe(a.netWorthPaise);
  });

  it('lets a balance adjustment fix cash without touching income or expense', () => {
    const withAdj = run(scenario(true), YEAR);
    const without = run(scenario(false), YEAR);
    expect(withAdj.incomePaise).toBe(without.incomePaise);
    expect(withAdj.expensePaise).toBe(without.expensePaise);
    // only the cash balance moved, by exactly the adjustment
    expect(balOf(withAdj, 'Cash') - balOf(without, 'Cash')).toBe(R(100));
  });
});
