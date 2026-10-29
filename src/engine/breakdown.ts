import type { ReimbursementPolicy, Split, Transaction } from '../db/types';
import { inRange, type DateRange } from '../lib/dates';
import { policyClaimable } from './policy';
import { bump } from './money';

const EXPENSE_LIKE = new Set(['expense', 'cc_purchase', 'shared_expense', 'cc_fee']);

export interface CategorySpend {
  netPaise: number;
  grossPaise: number;
  count: number;
}
export interface PurposeSpend {
  grossPaise: number;
  claimablePaise: number;
  netPaise: number;
}

export interface SpendBreakdown {
  /** Net personal spend by top-level category ('' = uncategorised). Matches the snapshot. */
  byCategory: Record<string, CategorySpend>;
  /** catId → subcategoryId → net. */
  subByCategory: Record<string, Record<string, number>>;
  /** catId → purposeId → net. */
  purposeByCategory: Record<string, Record<string, number>>;
  /** Spend grouped by purpose, with the reimbursable portion separated out. */
  byPurpose: Record<string, PurposeSpend>;
  totalNetPaise: number;
}

function parts(txn: Transaction, splits: Split[]): Array<Partial<Split> & { amountPaise: number }> {
  if (splits.length) return splits;
  return [{ amountPaise: txn.amountPaise, categoryId: txn.categoryId, subcategoryId: txn.subcategoryId, purposeId: txn.purposeId, reimbursable: txn.reimbursable }];
}

/**
 * My own gross spend on a single transaction that falls under a given purpose.
 * Mirrors the `byPurpose` grouping in `spendBreakdown`: use the splits when
 * present, skip any part that is a person's share, and fall back each part's
 * purpose to the transaction's. For a split expense this returns only MY
 * portion, not the friend's — so it matches the purpose row's Gross total.
 */
export function txnGrossForPurpose(txn: Transaction, splits: Split[], purposeId: string): number {
  let gross = 0;
  for (const part of parts(txn, splits)) {
    if (part.personId) continue; // friend's share
    if ((part.purposeId ?? txn.purposeId ?? '') === purposeId) gross += part.amountPaise;
  }
  return gross;
}

/** Category / subcategory / purpose spend breakdown for a date range. */
export function spendBreakdown(
  input: { transactions: Transaction[]; splits: Split[]; policies: ReimbursementPolicy[] },
  range: DateRange
): SpendBreakdown {
  const splitsByTxn = new Map<string, Split[]>();
  for (const s of input.splits) {
    const arr = splitsByTxn.get(s.txnId) ?? [];
    arr.push(s);
    splitsByTxn.set(s.txnId, arr);
  }

  const byCategory: Record<string, CategorySpend> = {};
  const subByCategory: Record<string, Record<string, number>> = {};
  const purposeByCategory: Record<string, Record<string, number>> = {};
  const byPurpose: Record<string, PurposeSpend> = {};
  const catTxns: Record<string, Set<string>> = {};

  const addCat = (cat: string, net: number, gross: number, sub: string, purpose: string, txnId: string) => {
    const c = (byCategory[cat] ??= { netPaise: 0, grossPaise: 0, count: 0 });
    c.netPaise += net;
    c.grossPaise += gross;
    (catTxns[cat] ??= new Set()).add(txnId);
    bump((subByCategory[cat] ??= {}), sub, net);
    bump((purposeByCategory[cat] ??= {}), purpose, net);
  };

  for (const t of input.transactions) {
    if (t.voided || !inRange(t.date, range.from, range.to)) continue;

    if (t.type === 'refund') {
      const cat = t.categoryId ?? '';
      addCat(cat, -t.amountPaise, -t.amountPaise, t.subcategoryId ?? '', t.purposeId ?? '', t.id);
      const p = (byPurpose[t.purposeId ?? ''] ??= { grossPaise: 0, claimablePaise: 0, netPaise: 0 });
      p.grossPaise -= t.amountPaise;
      p.netPaise -= t.amountPaise;
      continue;
    }
    if (!EXPENSE_LIKE.has(t.type)) continue;

    for (const part of parts(t, splitsByTxn.get(t.id) ?? [])) {
      if (part.personId) continue; // friend's share
      const gross = part.amountPaise;
      const claimable = part.reimbursable ? policyClaimable({ ...part, amountPaise: gross }, t, { policies: input.policies }) : 0;
      const net = gross - claimable;
      const cat = part.categoryId ?? t.categoryId ?? '';
      const sub = part.subcategoryId ?? t.subcategoryId ?? '';
      const purpose = part.purposeId ?? t.purposeId ?? '';
      addCat(cat, net, gross, sub, purpose, t.id);
      const p = (byPurpose[purpose] ??= { grossPaise: 0, claimablePaise: 0, netPaise: 0 });
      p.grossPaise += gross;
      p.claimablePaise += claimable;
      p.netPaise += net;
    }
  }

  let total = 0;
  for (const cat in byCategory) {
    byCategory[cat].count = catTxns[cat]?.size ?? 0;
    total += byCategory[cat].netPaise;
  }
  return { byCategory, subByCategory, purposeByCategory, byPurpose, totalNetPaise: total };
}
