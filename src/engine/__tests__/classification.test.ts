import { describe, it, expect } from 'vitest';
import { classifyTxn } from '../txnTypes';
import { acc, balOf, input, inv, policy, R, run, split, txn } from './_helpers';

const NO_CTX = { policies: [] };

describe('§5 classification rules', () => {
  it('1. personal metro fare is a plain expense', () => {
    const snap = run(
      input({
        accounts: [acc('bank', 'bank')],
        transactions: [txn({ type: 'expense', amountPaise: R(43), accountId: 'bank', categoryId: 'transport', purposeId: 'personal' })],
      })
    );
    expect(balOf(snap, 'bank')).toBe(R(-43));
    expect(snap.expensePaise).toBe(R(43));
    expect(snap.totalReceivablePaise).toBe(0);
  });

  it('2. office metro under a 50% policy: gross 43, claimable 21.50, net 21.50, nothing received yet', () => {
    const snap = run(
      input({
        accounts: [acc('bank', 'bank')],
        policies: [policy({ name: 'Office travel', matchPurposeId: 'office', percent: 50 })],
        transactions: [
          txn({ type: 'expense', amountPaise: R(43), accountId: 'bank', categoryId: 'transport', purposeId: 'office', reimbursable: true }),
        ],
      })
    );
    expect(balOf(snap, 'bank')).toBe(R(-43));
    expect(snap.grossExpensePaise).toBe(R(43));
    expect(snap.reimb.claimablePaise).toBe(R(21.5)); // 2150 paise, exact
    expect(snap.expensePaise).toBe(R(21.5)); // net personal
    expect(snap.reimb.receivedPaise).toBe(0); // eligible ≠ received
    expect(snap.reimb.outstandingPaise).toBe(R(21.5));
  });

  it('3. shared dinner: your 1,200 is expense, friend’s 800 is a receivable', () => {
    const t = txn({ type: 'shared_expense', amountPaise: R(2000), accountId: 'bank' });
    const snap = run(
      input({
        accounts: [acc('bank', 'bank')],
        transactions: [t],
        splits: [split(t.id, { amountPaise: R(800), personId: 'friend' }), split(t.id, { amountPaise: R(1200), categoryId: 'food' })],
      })
    );
    expect(balOf(snap, 'bank')).toBe(R(-2000));
    expect(snap.expensePaise).toBe(R(1200));
    expect(snap.totalReceivablePaise).toBe(R(800));
    expect(snap.receivableByPerson['friend']).toBe(R(800));
  });

  it('4. a friend repaying ₹500 is cash in and a smaller receivable — never income', () => {
    const e = classifyTxn(
      txn({ type: 'loan_repayment_received', amountPaise: R(500), accountId: 'bank', personId: 'friend' }),
      [],
      NO_CTX
    );
    expect(e.account['bank']).toBe(R(500));
    expect(e.receivable['friend']).toBe(R(-500));
    expect(e.income).toBe(0);
  });

  it('5. a bank→broker transfer moves money, it is neither income nor expense', () => {
    const snap = run(
      input({
        accounts: [acc('bank', 'bank'), acc('broker', 'broker_cash')],
        transactions: [txn({ type: 'transfer', amountPaise: R(10000), accountId: 'bank', counterAccountId: 'broker' })],
      })
    );
    expect(balOf(snap, 'bank')).toBe(R(-10000));
    expect(balOf(snap, 'broker')).toBe(R(10000));
    expect(snap.expensePaise).toBe(0);
    expect(snap.incomePaise).toBe(0);
  });

  it('6. buying stock from broker cash lowers broker cash and raises holding cost — not an expense', () => {
    const snap = run(
      input({
        accounts: [acc('broker', 'broker_cash')],
        investments: [inv('stockX')],
        transactions: [txn({ type: 'investment_buy', amountPaise: R(10000), accountId: 'broker', investmentId: 'stockX', units: 10 })],
      })
    );
    expect(balOf(snap, 'broker')).toBe(R(-10000));
    expect(snap.portfolio.byInvestment['stockX'].costPaise).toBe(R(10000));
    expect(snap.expensePaise).toBe(0);
    expect(snap.investedPaise).toBe(R(10000));
  });

  it('7. a card purchase is an expense AND grows the card payable', () => {
    const snap = run(
      input({
        accounts: [acc('card', 'credit_card')],
        transactions: [txn({ type: 'cc_purchase', amountPaise: R(2000), accountId: 'card', categoryId: 'shopping' })],
      })
    );
    expect(snap.expensePaise).toBe(R(2000));
    expect(snap.netWorthParts.cardPayablePaise).toBe(R(2000));
    expect(balOf(snap, 'card')).toBe(R(-2000));
  });

  it('8. paying the card bill from the bank is a transfer — no second expense', () => {
    const snap = run(
      input({
        accounts: [acc('bank', 'bank'), acc('card', 'credit_card')],
        transactions: [txn({ type: 'cc_repayment', amountPaise: R(2000), accountId: 'bank', counterAccountId: 'card' })],
      })
    );
    expect(balOf(snap, 'bank')).toBe(R(-2000));
    expect(balOf(snap, 'card')).toBe(R(2000)); // payable reduced by 2,000
    expect(snap.expensePaise).toBe(0);
  });

  it('9. a ₹55,000 credit splits into ₹50,000 salary + ₹5,000 reimbursement — salary is not 55,000', () => {
    const t = txn({ type: 'income', amountPaise: R(55000), accountId: 'bank' });
    const snap = run(
      input({
        accounts: [acc('bank', 'bank')],
        transactions: [t],
        splits: [split(t.id, { amountPaise: R(50000), categoryId: 'salary' }), split(t.id, { amountPaise: R(5000), reimbursable: true })],
      })
    );
    expect(balOf(snap, 'bank')).toBe(R(55000));
    expect(snap.incomePaise).toBe(R(50000));
    expect(snap.incomeByCategory['salary']).toBe(R(50000));
    expect(snap.reimb.receivedPaise).toBe(R(5000));
    expect(snap.reimb.outstandingPaise).toBe(R(-5000)); // receiving reduces outstanding
  });

  it('11. an advance a friend pre-pays is cash in and grows what you owe them — exactly like borrowing, never income', () => {
    const e = classifyTxn(
      txn({ type: 'advance_received', amountPaise: R(2000), accountId: 'bank', personId: 'friend' }),
      [],
      NO_CTX
    );
    expect(e.account['bank']).toBe(R(2000)); // cash in
    expect(e.payable['friend']).toBe(R(2000)); // you now owe them (will cover their expense)
    expect(e.income).toBe(0); // not income
    expect(e.receivable['friend']).toBeUndefined();

    // It must behave identically to 'borrowed'.
    const borrowed = classifyTxn(
      txn({ type: 'borrowed', amountPaise: R(2000), accountId: 'bank', personId: 'friend' }),
      [],
      NO_CTX
    );
    expect(e).toEqual(borrowed);
  });

  it('10. a repayment today links to an earlier loan, lifts today’s cash, lowers the outstanding — original untouched', () => {
    const loan = txn({ id: 'loan1', type: 'lent', amountPaise: R(1000), accountId: 'bank', personId: 'friend', date: '2026-09-01' });
    const repay = txn({ type: 'loan_repayment_received', amountPaise: R(400), accountId: 'bank', personId: 'friend', date: '2026-10-11', linkedTxnId: 'loan1' });
    const inp = input({ accounts: [acc('bank', 'bank')], transactions: [loan, repay] });
    const snap = run(inp);

    expect(repay.linkedTxnId).toBe('loan1');
    expect(loan.date).toBe('2026-09-01'); // engine never mutates the original
    expect(balOf(snap, 'bank')).toBe(R(-600)); // −1000 lent + 400 back
    expect(snap.totalReceivablePaise).toBe(R(600)); // outstanding fell from 1000 to 600

    const repayEffect = classifyTxn(repay, [], NO_CTX);
    expect(repayEffect.account['bank']).toBe(R(400)); // today’s cash goes up
  });
});

describe('§5 invariants', () => {
  it('own-account transfers never double-count net worth', () => {
    const snap = run(
      input({
        accounts: [acc('bank', 'bank', R(100000)), acc('broker', 'broker_cash')],
        transactions: [txn({ type: 'transfer', amountPaise: R(10000), accountId: 'bank', counterAccountId: 'broker' })],
      })
    );
    expect(snap.netWorthPaise).toBe(R(100000)); // unchanged — money only moved
    expect(snap.availablePaise).toBe(R(90000)); // broker cash is not "available"
  });

  it('a cash withdrawal moves bank→cash and is NOT spending', () => {
    const snap = run(
      input({
        accounts: [acc('bank', 'bank', R(50000)), acc('cash', 'cash')],
        transactions: [txn({ type: 'cash_withdrawal', amountPaise: R(5000), accountId: 'bank', counterAccountId: 'cash' })],
      })
    );
    expect(balOf(snap, 'bank')).toBe(R(45000));
    expect(balOf(snap, 'cash')).toBe(R(5000));
    expect(snap.expensePaise).toBe(0);
    expect(snap.availablePaise).toBe(R(50000)); // bank + cash unchanged in total
  });

  it('opening balances are a position, never current-period income', () => {
    const snap = run(input({ accounts: [acc('bank', 'bank', R(100000), '2026-01-01')] }));
    expect(snap.incomePaise).toBe(0);
    expect(snap.availablePaise).toBe(R(100000));
    expect(snap.netWorthPaise).toBe(R(100000));
  });

  it('splits never double-count the parent amount', () => {
    const t = txn({ type: 'expense', amountPaise: R(2000), accountId: 'bank' });
    const snap = run(
      input({
        accounts: [acc('bank', 'bank')],
        transactions: [t],
        splits: [split(t.id, { amountPaise: R(1200), categoryId: 'food' }), split(t.id, { amountPaise: R(800), categoryId: 'drinks' })],
      })
    );
    expect(snap.expensePaise).toBe(R(2000));
    expect(balOf(snap, 'bank')).toBe(R(-2000));
    expect(snap.expenseByCategory['food']).toBe(R(1200));
    expect(snap.expenseByCategory['drinks']).toBe(R(800));
  });

  it('a refund reduces spending, it is not income', () => {
    const snap = run(
      input({
        accounts: [acc('bank', 'bank')],
        transactions: [
          txn({ type: 'expense', amountPaise: R(2000), accountId: 'bank', categoryId: 'shopping', date: '2026-10-01' }),
          txn({ type: 'refund', amountPaise: R(500), accountId: 'bank', categoryId: 'shopping', date: '2026-10-05' }),
        ],
      })
    );
    expect(snap.expensePaise).toBe(R(1500));
    expect(snap.incomePaise).toBe(0);
    expect(balOf(snap, 'bank')).toBe(R(-1500));
  });

  it('savings = income − expense, and the rate is a share of income', () => {
    const t = txn({ type: 'income', amountPaise: R(100000), accountId: 'bank' });
    const snap = run(
      input({
        accounts: [acc('bank', 'bank')],
        transactions: [t, txn({ type: 'expense', amountPaise: R(40000), accountId: 'bank', categoryId: 'rent' })],
      })
    );
    expect(snap.savingsPaise).toBe(R(60000));
    expect(snap.savingsRate).toBeCloseTo(60, 5);
  });
});
