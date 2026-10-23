import type { ReimbursementPolicy, Split, Transaction } from '../db/types';
import { inRange, type DateRange } from '../lib/dates';
import { classifyTxn } from './txnTypes';

export interface EventTotals {
  count: number;
  /** Everything that left your pocket for this event. */
  paidPaise: number;
  /** Your gross expense portion (before reimbursements). */
  grossPaise: number;
  /** Net personal cost (gross − claimable reimbursements). */
  netPersonalPaise: number;
  /** Recoverable from other people (their shares). */
  recoverablePaise: number;
  /** Claimable back from an employer. */
  reimbursablePaise: number;
}

function empty(): EventTotals {
  return { count: 0, paidPaise: 0, grossPaise: 0, netPersonalPaise: 0, recoverablePaise: 0, reimbursablePaise: 0 };
}

export interface EventInput {
  transactions: Transaction[];
  splits: Split[];
  policies: ReimbursementPolicy[];
}

/** Per-event money breakdown within a date range. */
export function eventBreakdown(input: EventInput, range: DateRange): Record<string, EventTotals> {
  const splitsByTxn = new Map<string, Split[]>();
  for (const s of input.splits) {
    const arr = splitsByTxn.get(s.txnId) ?? [];
    arr.push(s);
    splitsByTxn.set(s.txnId, arr);
  }
  const out: Record<string, EventTotals> = {};
  for (const t of input.transactions) {
    if (t.voided || !t.eventId || !inRange(t.date, range.from, range.to)) continue;
    const e = classifyTxn(t, splitsByTxn.get(t.id) ?? [], { policies: input.policies });
    const tot = (out[t.eventId] ??= empty());
    tot.count += 1;
    tot.grossPaise += e.grossExpense;
    tot.netPersonalPaise += e.expense;
    tot.reimbursablePaise += e.reimbClaimable;
    for (const k in e.receivable) tot.recoverablePaise += e.receivable[k];
    // Money that actually left accounts (outflows only).
    for (const k in e.account) if (e.account[k] < 0) tot.paidPaise += -e.account[k];
  }
  return out;
}
