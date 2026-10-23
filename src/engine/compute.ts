import type { Account, Investment, Price, ReimbursementClaim, ReimbursementPolicy, Split, Transaction } from '../db/types';
import { fmtDayMonth, fmtMonth } from '../lib/format';
import {
  addDays,
  endOfMonth,
  inRange,
  spanDays,
  startOfMonth,
  type DateRange,
  type ISODate,
} from '../lib/dates';
import { emptyEffect, type Effect } from './effect';
import { mergeInto } from './money';
import { buildPortfolio, type Portfolio } from './portfolio';
import { classifyTxn } from './txnTypes';

export interface EngineInput {
  transactions: Transaction[];
  splits: Split[];
  accounts: Account[];
  policies: ReimbursementPolicy[];
  claims: ReimbursementClaim[];
  investments: Investment[];
  prices: Price[];
}

export interface Filters {
  accountIds?: string[];
  categoryIds?: string[];
  personIds?: string[];
  purposeIds?: string[];
  eventId?: string;
  tags?: string[];
}

export interface Classified {
  txn: Transaction;
  effect: Effect;
}

export interface AccountBalance {
  account: Account;
  balancePaise: number;
}

export interface SeriesPoint {
  label: string;
  date: ISODate;
  valuePaise: number;
}
export interface CashflowPoint {
  label: string;
  date: ISODate;
  inPaise: number;
  outPaise: number;
  netPaise: number;
}

export interface Snapshot {
  asOf: ISODate;
  range: DateRange;

  // positions (as of asOf)
  balances: AccountBalance[];
  availablePaise: number; // bank + cash
  receivableByPerson: Record<string, number>;
  payableByPerson: Record<string, number>;
  totalReceivablePaise: number;
  totalPayablePaise: number;
  portfolio: Portfolio;
  netWorthPaise: number;
  netWorthParts: {
    bankCashPaise: number;
    brokerCashPaise: number;
    otherAssetsPaise: number;
    investmentsPaise: number;
    receivablesPaise: number;
    cardPayablePaise: number;
    borrowingsPaise: number;
  };

  // flows (within range)
  incomePaise: number;
  incomeByCategory: Record<string, number>;
  expensePaise: number; // net personal
  grossExpensePaise: number;
  expenseByCategory: Record<string, number>; // net personal by category ('' = uncategorised)
  investedPaise: number;
  savingsPaise: number;
  savingsRate: number | null;

  // reimbursements
  reimb: {
    eligibleGrossPaise: number; // in range
    claimablePaise: number; // in range
    receivedPaise: number; // in range
    submittedPaise: number; // from claims
    outstandingPaise: number; // cumulative claimable − received, as of asOf
  };

  // attention
  uncategorisedCount: number;

  // series
  cashflowSeries: CashflowPoint[];
  netWorthSeries: SeriesPoint[];
}

/* ---------------------------------------------------------------- classify */

export function classifyAll(input: EngineInput): Classified[] {
  const splitsByTxn = new Map<string, Split[]>();
  for (const s of input.splits) {
    const arr = splitsByTxn.get(s.txnId) ?? [];
    arr.push(s);
    splitsByTxn.set(s.txnId, arr);
  }
  const ctx = { policies: input.policies };
  return input.transactions
    .filter((t) => !t.voided)
    .map((txn) => ({ txn, effect: classifyTxn(txn, splitsByTxn.get(txn.id) ?? [], ctx) }));
}

/* --------------------------------------------------------------- positions */

function accountBalancesAsOf(classified: Classified[], accounts: Account[], asOf: ISODate): Record<string, number> {
  const bal: Record<string, number> = {};
  for (const a of accounts) bal[a.id] = a.openingDate <= asOf ? a.openingBalancePaise : 0;
  for (const c of classified) {
    if (c.txn.date > asOf) continue;
    for (const id in c.effect.account) bal[id] = (bal[id] ?? 0) + c.effect.account[id];
  }
  return bal;
}

function peopleAsOf(classified: Classified[], asOf: ISODate): { recv: Record<string, number>; pay: Record<string, number> } {
  const recv: Record<string, number> = {};
  const pay: Record<string, number> = {};
  for (const c of classified) {
    if (c.txn.date > asOf) continue;
    mergeInto(recv, c.effect.receivable);
    mergeInto(pay, c.effect.payable);
  }
  return { recv, pay };
}

/** Net receivable/payable per person (lending and borrowing net out). */
function netPeople(recv: Record<string, number>, pay: Record<string, number>) {
  const ids = new Set<string>([...Object.keys(recv), ...Object.keys(pay)]);
  const receivableByPerson: Record<string, number> = {};
  const payableByPerson: Record<string, number> = {};
  let totalReceivable = 0;
  let totalPayable = 0;
  for (const id of ids) {
    const net = (recv[id] ?? 0) - (pay[id] ?? 0);
    if (net > 0) {
      receivableByPerson[id] = net;
      totalReceivable += net;
    } else if (net < 0) {
      payableByPerson[id] = -net;
      totalPayable += -net;
    }
  }
  return { receivableByPerson, payableByPerson, totalReceivable, totalPayable };
}

function reimbCumAsOf(classified: Classified[], asOf: ISODate) {
  let claimable = 0;
  let received = 0;
  for (const c of classified) {
    if (c.txn.date > asOf) continue;
    claimable += c.effect.reimbClaimable;
    received += c.effect.reimbReceived;
  }
  return { claimable, received };
}

/** Net worth and its parts, as of a date. */
export function netWorthAsOf(input: EngineInput, classified: Classified[], asOf: ISODate) {
  const bal = accountBalancesAsOf(classified, input.accounts, asOf);
  let bankCash = 0;
  let broker = 0;
  let other = 0;
  let cardNet = 0;
  let cardPayable = 0;
  for (const a of input.accounts) {
    const b = bal[a.id] ?? 0;
    if (a.type === 'bank' || a.type === 'cash') bankCash += b;
    else if (a.type === 'broker_cash') broker += b;
    else if (a.type === 'credit_card') {
      cardNet += b;
      if (b < 0) cardPayable += -b;
    } else other += b;
  }
  const { recv, pay } = peopleAsOf(classified, asOf);
  const people = netPeople(recv, pay);
  const portfolio = buildPortfolio(input.transactions, input.investments, input.prices, asOf);
  const netWorth = bankCash + broker + other + cardNet + portfolio.totalValuePaise + people.totalReceivable - people.totalPayable;
  return { netWorth, bankCash, broker, other, cardNet, cardPayable, people, portfolio, balances: bal };
}

/* ------------------------------------------------------------------- flows */

function passesFilter(txn: Transaction, f?: Filters): boolean {
  if (!f) return true;
  if (f.accountIds?.length && !(f.accountIds.includes(txn.accountId ?? '') || f.accountIds.includes(txn.counterAccountId ?? ''))) return false;
  if (f.categoryIds?.length && !f.categoryIds.includes(txn.categoryId ?? '')) return false;
  if (f.personIds?.length && !f.personIds.includes(txn.personId ?? '')) return false;
  if (f.purposeIds?.length && !f.purposeIds.includes(txn.purposeId ?? '')) return false;
  if (f.eventId && txn.eventId !== f.eventId) return false;
  if (f.tags?.length && !(txn.tags ?? []).some((t) => f.tags!.includes(t))) return false;
  return true;
}

function flowsInRange(classified: Classified[], range: DateRange, filters?: Filters) {
  const acc = emptyEffect();
  for (const c of classified) {
    if (!inRange(c.txn.date, range.from, range.to)) continue;
    if (!passesFilter(c.txn, filters)) continue;
    const e = c.effect;
    acc.income += e.income;
    acc.expense += e.expense;
    acc.grossExpense += e.grossExpense;
    acc.invested += e.invested;
    acc.reimbEligibleGross += e.reimbEligibleGross;
    acc.reimbClaimable += e.reimbClaimable;
    acc.reimbReceived += e.reimbReceived;
    mergeInto(acc.incomeByCategory, e.incomeByCategory);
    mergeInto(acc.expenseByCategory, e.expenseByCategory);
  }
  return acc;
}

const EXPENSE_LIKE = new Set(['expense', 'cc_purchase', 'shared_expense']);

function countUncategorised(classified: Classified[], splitsByTxn: Map<string, Split[]>, range: DateRange): number {
  let n = 0;
  for (const c of classified) {
    const t = c.txn;
    if (!inRange(t.date, range.from, range.to)) continue;
    if (!EXPENSE_LIKE.has(t.type) && t.type !== 'income') continue;
    const splits = splitsByTxn.get(t.id) ?? [];
    const hasCat = !!t.categoryId || splits.some((s) => s.categoryId);
    if (!hasCat) n++;
  }
  return n;
}

/* ------------------------------------------------------------------ series */

interface Bucket {
  start: ISODate;
  end: ISODate;
  label: string;
}

export function bucketize(range: DateRange): Bucket[] {
  const n = spanDays(range.from, range.to);
  if (n <= 1) return [{ start: range.from, end: range.to, label: fmtDayMonth(range.from) }];

  const buckets: Bucket[] = [];
  if (n <= 16) {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) buckets.push({ start: d, end: d, label: fmtDayMonth(d) });
  } else if (n <= 95) {
    for (let d = range.from; d <= range.to; d = addDays(d, 7)) {
      const end = addDays(d, 6);
      buckets.push({ start: d, end: end > range.to ? range.to : end, label: fmtDayMonth(d) });
    }
  } else {
    let m = startOfMonth(range.from);
    while (m <= range.to) {
      const start = m < range.from ? range.from : m;
      const eom = endOfMonth(m);
      buckets.push({ start, end: eom > range.to ? range.to : eom, label: fmtMonth(m) });
      m = startOfMonth(addDays(eom, 1));
    }
  }
  return buckets;
}

/* ---------------------------------------------------------- the big picture */

export function computeSnapshot(input: EngineInput, range: DateRange, filters?: Filters): Snapshot {
  const asOf = range.to;
  const classified = classifyAll(input);

  const splitsByTxn = new Map<string, Split[]>();
  for (const s of input.splits) {
    const arr = splitsByTxn.get(s.txnId) ?? [];
    arr.push(s);
    splitsByTxn.set(s.txnId, arr);
  }

  // positions
  const nw = netWorthAsOf(input, classified, asOf);
  const balances: AccountBalance[] = input.accounts.map((a) => ({ account: a, balancePaise: nw.balances[a.id] ?? 0 }));
  const availablePaise = input.accounts
    .filter((a) => a.type === 'bank' || a.type === 'cash')
    .reduce((s, a) => s + (nw.balances[a.id] ?? 0), 0);

  // flows
  const flows = flowsInRange(classified, range, filters);
  const savings = flows.income - flows.expense;
  const savingsRate = flows.income > 0 ? (savings / flows.income) * 100 : null;

  // reimbursements
  const cum = reimbCumAsOf(classified, asOf);
  const submitted = input.claims
    .filter((c: ReimbursementClaim) => c.status === 'submitted' || c.status === 'approved')
    .reduce((s, c) => s + c.amountPaise, 0);

  // series
  const buckets = bucketize(range);
  const cashflowSeries: CashflowPoint[] = buckets.map((b) => {
    let inP = 0;
    let outP = 0;
    for (const c of classified) {
      if (!inRange(c.txn.date, b.start, b.end)) continue;
      if (!passesFilter(c.txn, filters)) continue;
      inP += c.effect.income;
      outP += c.effect.expense;
    }
    return { label: b.label, date: b.end, inPaise: inP, outPaise: outP, netPaise: inP - outP };
  });
  const netWorthSeries: SeriesPoint[] = buckets.map((b) => ({
    label: b.label,
    date: b.end,
    valuePaise: netWorthAsOf(input, classified, b.end).netWorth,
  }));

  return {
    asOf,
    range,
    balances,
    availablePaise,
    receivableByPerson: nw.people.receivableByPerson,
    payableByPerson: nw.people.payableByPerson,
    totalReceivablePaise: nw.people.totalReceivable,
    totalPayablePaise: nw.people.totalPayable,
    portfolio: nw.portfolio,
    netWorthPaise: nw.netWorth,
    netWorthParts: {
      bankCashPaise: nw.bankCash,
      brokerCashPaise: nw.broker,
      otherAssetsPaise: nw.other,
      investmentsPaise: nw.portfolio.totalValuePaise,
      receivablesPaise: nw.people.totalReceivable,
      cardPayablePaise: nw.cardPayable,
      borrowingsPaise: nw.people.totalPayable,
    },
    incomePaise: flows.income,
    incomeByCategory: flows.incomeByCategory,
    expensePaise: flows.expense,
    grossExpensePaise: flows.grossExpense,
    expenseByCategory: flows.expenseByCategory,
    investedPaise: flows.invested,
    savingsPaise: savings,
    savingsRate,
    reimb: {
      eligibleGrossPaise: flows.reimbEligibleGross,
      claimablePaise: flows.reimbClaimable,
      receivedPaise: flows.reimbReceived,
      submittedPaise: submitted,
      outstandingPaise: cum.claimable - cum.received,
    },
    uncategorisedCount: countUncategorised(classified, splitsByTxn, range),
    cashflowSeries,
    netWorthSeries,
  };
}
