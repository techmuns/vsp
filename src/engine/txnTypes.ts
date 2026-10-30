import type { Split, Transaction } from '../db/types';
import { MONEY } from '../lib/brand';
import { emptyEffect, type Effect } from './effect';
import { bump } from './money';
import { policyClaimable, type ClassifyCtx } from './policy';

export type TxnGroup = 'spend' | 'earn' | 'move' | 'invest' | 'people' | 'reimburse' | 'card' | 'adjust';
export type TxnDirection = 'out' | 'in' | 'neutral';

export interface TxnTypeDef {
  id: string;
  /** Plain-language label shown to the user — never accounting jargon. */
  label: string;
  group: TxnGroup;
  direction: TxnDirection;
  /** The money-concept colour for this type. */
  color: string;
  /** Hidden from the simple Quick-Add picker until "more" is expanded. */
  advanced?: boolean;
  /** Which fields the entry form should collect. */
  fields?: {
    account?: boolean;
    counter?: boolean;
    person?: boolean;
    investment?: boolean;
    category?: boolean;
  };
  classify: (txn: Transaction, splits: Split[], ctx: ClassifyCtx) => Effect;
}

/** The registry. Adding a new type is `registerTxnType({...})` — no rewrites. */
export const TXN_TYPES: Record<string, TxnTypeDef> = {};

export function registerTxnType(def: TxnTypeDef): void {
  TXN_TYPES[def.id] = def;
}
export function getTxnType(id: string): TxnTypeDef | undefined {
  return TXN_TYPES[id];
}
export function listTxnTypes(): TxnTypeDef[] {
  return Object.values(TXN_TYPES);
}

/** Set of types whose activity feeds the investment portfolio. */
export const INVESTMENT_TYPES = new Set([
  'investment_buy',
  'investment_sell',
  'investment_contribution',
  'investment_withdrawal',
  'investment_dividend',
  'investment_charge',
]);

/* -------------------------------------------------------- shared classifiers */

/** A single synthetic line from the txn itself (no personId → never a receivable). */
function wholeLine(txn: Transaction): Partial<Split> & { amountPaise: number } {
  return {
    amountPaise: txn.amountPaise,
    categoryId: txn.categoryId,
    subcategoryId: txn.subcategoryId,
    purposeId: txn.purposeId,
    reimbursable: txn.reimbursable,
  };
}

/**
 * Expense-like: money leaves `accountId` (bank OR credit card). Person-splits
 * become receivables (someone else's share); the rest is your expense, less any
 * policy-claimable amount.
 */
function classifyExpenseLike(txn: Transaction, splits: Split[], ctx: ClassifyCtx): Effect {
  const e = emptyEffect();
  if (txn.accountId) bump(e.account, txn.accountId, -txn.amountPaise);

  const parts = splits.length ? splits : [wholeLine(txn)];
  for (const p of parts) {
    if (p.personId) {
      // someone else's share of what you paid → they owe you
      bump(e.receivable, p.personId, p.amountPaise);
      continue;
    }
    const gross = p.amountPaise;
    e.grossExpense += gross;
    let claimable = 0;
    if (p.reimbursable) {
      claimable = policyClaimable({ ...p, amountPaise: gross }, txn, ctx);
      e.reimbEligibleGross += gross;
      e.reimbClaimable += claimable;
    }
    const net = gross - claimable;
    e.expense += net;
    bump(e.expenseByCategory, p.categoryId ?? '', net);
  }
  return e;
}

/** Income: money enters `accountId`. A reimbursable line is money coming BACK
 *  (a reimbursement receipt), kept out of income. */
function classifyIncome(txn: Transaction, splits: Split[]): Effect {
  const e = emptyEffect();
  if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
  const parts = splits.length ? splits : [wholeLine(txn)];
  for (const p of parts) {
    if (p.reimbursable) {
      e.reimbReceived += p.amountPaise;
    } else {
      e.income += p.amountPaise;
      bump(e.incomeByCategory, p.categoryId ?? '', p.amountPaise);
    }
  }
  return e;
}

/** A plain move of money from one of your accounts to another. */
function classifyTransfer(txn: Transaction): Effect {
  const e = emptyEffect();
  if (txn.accountId) bump(e.account, txn.accountId, -txn.amountPaise);
  if (txn.counterAccountId) bump(e.account, txn.counterAccountId, txn.amountPaise);
  return e;
}

const F = {
  spendBank: { account: true, category: true },
  spendShared: { account: true, category: true, person: true },
  earn: { account: true, category: true },
  move: { account: true, counter: true },
  person: { account: true, person: true },
  invest: { account: true, investment: true },
  cardPay: { account: true, counter: true },
} as const;

/* ------------------------------------------------------------- registration */

registerTxnType({
  id: 'expense',
  label: 'Spent',
  group: 'spend',
  direction: 'out',
  color: MONEY.out,
  fields: F.spendBank,
  classify: classifyExpenseLike,
});

registerTxnType({
  id: 'income',
  label: 'Received',
  group: 'earn',
  direction: 'in',
  color: MONEY.in,
  fields: F.earn,
  classify: (txn, splits) => classifyIncome(txn, splits),
});

registerTxnType({
  id: 'transfer',
  label: 'Transfer',
  group: 'move',
  direction: 'neutral',
  color: MONEY.transfer,
  fields: F.move,
  classify: (txn) => classifyTransfer(txn),
});

registerTxnType({
  id: 'shared_expense',
  label: 'Paid for someone',
  group: 'spend',
  direction: 'out',
  color: MONEY.out,
  fields: F.spendShared,
  classify: classifyExpenseLike,
});

registerTxnType({
  id: 'investment_buy',
  label: 'Bought an investment',
  group: 'invest',
  direction: 'out',
  color: MONEY.invest,
  fields: F.invest,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, -txn.amountPaise);
    e.invested += txn.amountPaise;
    return e;
  },
});

registerTxnType({
  id: 'investment_sell',
  label: 'Sold an investment',
  group: 'invest',
  direction: 'in',
  color: MONEY.invest,
  advanced: true,
  fields: F.invest,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    e.invested -= txn.amountPaise;
    return e;
  },
});

registerTxnType({
  id: 'investment_contribution',
  label: 'Added to investments',
  group: 'invest',
  direction: 'out',
  color: MONEY.invest,
  advanced: true,
  fields: F.invest,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, -txn.amountPaise);
    e.invested += txn.amountPaise;
    return e;
  },
});

registerTxnType({
  id: 'investment_withdrawal',
  label: 'Withdrew from investments',
  group: 'invest',
  direction: 'in',
  color: MONEY.invest,
  advanced: true,
  fields: F.invest,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    e.invested -= txn.amountPaise;
    return e;
  },
});

registerTxnType({
  id: 'investment_dividend',
  label: 'Dividend / payout',
  group: 'invest',
  direction: 'in',
  color: MONEY.invest,
  advanced: true,
  fields: F.invest,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    // A payout from an investment is income you received.
    e.income += txn.amountPaise;
    return e;
  },
});

registerTxnType({
  id: 'investment_charge',
  label: 'Investment charge / fee',
  group: 'invest',
  direction: 'out',
  color: MONEY.invest,
  advanced: true,
  fields: F.invest,
  // An investing cost (brokerage, AMC). It reduces cash but is not lifestyle
  // spending, so it is kept out of personal expense.
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, -txn.amountPaise);
    return e;
  },
});

registerTxnType({
  id: 'lent',
  label: 'Lent money',
  group: 'people',
  direction: 'out',
  color: MONEY.receivable,
  fields: F.person,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, -txn.amountPaise);
    if (txn.personId) bump(e.receivable, txn.personId, txn.amountPaise);
    return e;
  },
});

registerTxnType({
  id: 'borrowed',
  label: 'Borrowed money',
  group: 'people',
  direction: 'in',
  color: MONEY.payable,
  fields: F.person,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    if (txn.personId) bump(e.payable, txn.personId, txn.amountPaise);
    return e;
  },
});

registerTxnType({
  id: 'advance_received',
  label: 'Advance received',
  group: 'people',
  direction: 'in',
  color: MONEY.payable,
  fields: F.person,
  // A friend pre-pays you for an expense you'll cover for them. Like 'borrowed':
  // cash comes in now and you owe it back (settled by the spend you make for them).
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    if (txn.personId) bump(e.payable, txn.personId, txn.amountPaise);
    return e;
  },
});

registerTxnType({
  id: 'loan_repayment_received',
  label: 'Got money back',
  group: 'people',
  direction: 'in',
  color: MONEY.receivable,
  fields: F.person,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    if (txn.personId) bump(e.receivable, txn.personId, -txn.amountPaise);
    return e;
  },
});

registerTxnType({
  id: 'borrow_repayment_paid',
  label: 'Repaid money',
  group: 'people',
  direction: 'out',
  color: MONEY.payable,
  advanced: true,
  fields: F.person,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, -txn.amountPaise);
    if (txn.personId) bump(e.payable, txn.personId, -txn.amountPaise);
    return e;
  },
});

registerTxnType({
  id: 'reimbursement_receipt',
  label: 'Reimbursement received',
  group: 'reimburse',
  direction: 'in',
  color: MONEY.reimb,
  advanced: true,
  fields: F.earn,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    e.reimbReceived += txn.amountPaise;
    return e;
  },
});

registerTxnType({
  id: 'reimbursement_claim',
  label: 'Reimbursement claim filed',
  group: 'reimburse',
  direction: 'neutral',
  color: MONEY.reimb,
  advanced: true,
  // A marker only — no cash moves when you file a claim. "Submitted" totals
  // come from the claims list, not from money movement.
  classify: () => emptyEffect(),
});

registerTxnType({
  id: 'refund',
  label: 'Refund',
  group: 'earn',
  direction: 'in',
  color: MONEY.in,
  advanced: true,
  fields: F.earn,
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    // A refund gives back money you spent → it reduces spending, not income.
    e.expense -= txn.amountPaise;
    e.grossExpense -= txn.amountPaise;
    bump(e.expenseByCategory, txn.categoryId ?? '', -txn.amountPaise);
    return e;
  },
});

registerTxnType({
  id: 'cc_purchase',
  label: 'Card purchase',
  group: 'card',
  direction: 'out',
  color: MONEY.card,
  advanced: true,
  fields: F.spendBank,
  classify: classifyExpenseLike,
});

registerTxnType({
  id: 'cc_repayment',
  label: 'Card bill payment',
  group: 'card',
  direction: 'neutral',
  color: MONEY.card,
  advanced: true,
  fields: F.cardPay,
  // Paying your card bill is a transfer (bank → card). It is NOT a second expense.
  classify: (txn) => classifyTransfer(txn),
});

registerTxnType({
  id: 'cc_fee',
  label: 'Card fee / interest',
  group: 'card',
  direction: 'out',
  color: MONEY.card,
  advanced: true,
  fields: F.spendBank,
  classify: classifyExpenseLike,
});

registerTxnType({
  id: 'cash_withdrawal',
  label: 'Cash withdrawal',
  group: 'move',
  direction: 'neutral',
  color: MONEY.transfer,
  advanced: true,
  fields: F.move,
  // Moves bank → cash. Taking out cash is NOT spending it.
  classify: (txn) => classifyTransfer(txn),
});

registerTxnType({
  id: 'cash_deposit',
  label: 'Cash deposit',
  group: 'move',
  direction: 'neutral',
  color: MONEY.transfer,
  advanced: true,
  fields: F.move,
  classify: (txn) => classifyTransfer(txn),
});

registerTxnType({
  id: 'opening_balance',
  label: 'Opening balance',
  group: 'adjust',
  direction: 'neutral',
  color: MONEY.transfer,
  advanced: true,
  fields: F.move,
  // A starting position — not current-period income.
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    return e;
  },
});

registerTxnType({
  id: 'adjustment',
  label: 'Balance adjustment',
  group: 'adjust',
  direction: 'neutral',
  color: MONEY.transfer,
  advanced: true,
  fields: F.move,
  // A signed correction to reconcile an account. Not income/expense.
  classify: (txn) => {
    const e = emptyEffect();
    if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
    return e;
  },
});

/** Classify any transaction. Unknown types fall back to a neutral adjustment,
 *  so no data is ever lost or miscounted. */
export function classifyTxn(txn: Transaction, splits: Split[], ctx: ClassifyCtx): Effect {
  const def = TXN_TYPES[txn.type];
  if (def) return def.classify(txn, splits, ctx);
  const e = emptyEffect();
  if (txn.accountId) bump(e.account, txn.accountId, txn.amountPaise);
  return e;
}
