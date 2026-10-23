import type { ReimbursementPolicy, Split, Transaction } from '../db/types';
import { inRange, type DateRange } from '../lib/dates';
import { policyClaimable } from './policy';

/** Expense-like types whose reimbursable lines can be claimed back. */
const CLAIMABLE_TYPES = new Set(['expense', 'cc_purchase', 'shared_expense', 'cc_fee']);

export interface ClaimableLine {
  txnId: string;
  date: string;
  description: string;
  categoryId?: string;
  purposeId?: string;
  accountId?: string;
  /** Gross reimbursable amount (your portion that is eligible). */
  grossPaise: number;
  /** Claimable after the matching policy's percent / fixed / cap. */
  claimablePaise: number;
}

function linesFor(txn: Transaction, splits: Split[]): Array<Partial<Split> & { amountPaise: number }> {
  if (splits.length) return splits;
  return [
    {
      amountPaise: txn.amountPaise,
      categoryId: txn.categoryId,
      subcategoryId: txn.subcategoryId,
      purposeId: txn.purposeId,
      reimbursable: txn.reimbursable,
    },
  ];
}

/**
 * Gross-eligible and claimable amounts for one transaction. Only your own
 * reimbursable portions count — a friend's share (person split) never does, and
 * a line must be explicitly marked reimbursable (so a personal trip in an
 * otherwise-office category is NOT claimed just because the category matches).
 */
export function claimableForTxn(
  txn: Transaction,
  splits: Split[],
  policies: ReimbursementPolicy[]
): { grossPaise: number; claimablePaise: number } {
  if (txn.voided || !CLAIMABLE_TYPES.has(txn.type)) return { grossPaise: 0, claimablePaise: 0 };
  let gross = 0;
  let claimable = 0;
  for (const p of linesFor(txn, splits)) {
    if (p.personId) continue; // someone else's share
    if (!p.reimbursable) continue; // only lines the user flagged
    gross += p.amountPaise;
    claimable += policyClaimable({ ...p, amountPaise: p.amountPaise }, txn, { policies });
  }
  return { grossPaise: gross, claimablePaise: claimable };
}

export interface ClaimableInput {
  transactions: Transaction[];
  splits: Split[];
  policies: ReimbursementPolicy[];
}

/** Every claimable line in a date range (claimable > 0), most recent first. */
export function buildClaimableLines(input: ClaimableInput, range: DateRange): ClaimableLine[] {
  const splitsByTxn = new Map<string, Split[]>();
  for (const s of input.splits) {
    const arr = splitsByTxn.get(s.txnId) ?? [];
    arr.push(s);
    splitsByTxn.set(s.txnId, arr);
  }
  const lines: ClaimableLine[] = [];
  for (const t of input.transactions) {
    if (t.voided || !inRange(t.date, range.from, range.to)) continue;
    const { grossPaise, claimablePaise } = claimableForTxn(t, splitsByTxn.get(t.id) ?? [], input.policies);
    if (claimablePaise <= 0) continue;
    lines.push({
      txnId: t.id,
      date: t.date,
      description: t.description ?? '',
      categoryId: t.categoryId,
      purposeId: t.purposeId,
      accountId: t.accountId,
      grossPaise,
      claimablePaise,
    });
  }
  return lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Total of a claim batch: sum the claimable lines, skipping excluded ones and
 * honouring any per-line manual override (e.g. the user trims an amount).
 */
export function claimBatchTotal(
  lines: ClaimableLine[],
  opts: { excludeIds?: Set<string>; overrides?: Record<string, number> } = {}
): number {
  let total = 0;
  for (const l of lines) {
    if (opts.excludeIds?.has(l.txnId)) continue;
    total += opts.overrides?.[l.txnId] ?? l.claimablePaise;
  }
  return total;
}
