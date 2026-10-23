import type { Transaction } from '../db/types';
import { daysBetween, type ISODate } from '../lib/dates';
import { getTxnType } from './txnTypes';

/** A parsed statement row — amount is SIGNED (+ money in, − money out) in paise. */
export interface ParsedRow {
  date: ISODate;
  description: string;
  amountPaise: number;
  balancePaise?: number;
  reference?: string;
  raw?: string[];
}

export type MatchStatus = 'matched' | 'duplicate' | 'new';

export interface RowResult {
  index: number;
  row: ParsedRow;
  status: MatchStatus;
  matchTxnId?: string;
  note?: string;
  /** For balance-column rows: did the running total match the stated balance? */
  balanceOk?: boolean;
}

export interface ReconcileResult {
  results: RowResult[];
  summary: { matched: number; duplicates: number; newCount: number; balanceMismatches: number };
  balanceCheck: {
    openingPaise?: number;
    computedClosingPaise?: number;
    statedClosingPaise?: number;
    ok: boolean | null;
  };
}

function dirOfSigned(paise: number): 'in' | 'out' {
  return paise >= 0 ? 'in' : 'out';
}

export interface ReconcileOpts {
  accountId?: string;
  openingBalancePaise?: number;
  closingBalancePaise?: number;
  dateToleranceDays?: number;
}

/**
 * Compare parsed statement rows against existing transactions:
 *  - matched    → an existing manually-entered transaction (same abs amount,
 *                 direction, close date; a shared reference breaks ties)
 *  - duplicate  → the same row appears earlier in this import
 *  - new        → nothing like it exists yet
 * Plus a running-balance check against the statement's own opening/closing.
 * Nothing is ever discarded — this only classifies.
 */
export function reconcile(rows: ParsedRow[], existing: Transaction[], opts: ReconcileOpts = {}): ReconcileResult {
  const tol = opts.dateToleranceDays ?? 5;
  const pool = existing.filter((t) => !t.voided && (!opts.accountId || t.accountId === opts.accountId));
  const used = new Set<string>();
  const seen = new Map<string, number>();

  const results: RowResult[] = rows.map((row, index) => {
    const abs = Math.abs(row.amountPaise);
    const dir = dirOfSigned(row.amountPaise);

    // 1) match an existing transaction
    let best: { id: string; score: number } | null = null;
    for (const t of pool) {
      if (used.has(t.id) || t.amountPaise !== abs) continue;
      const td = getTxnType(t.type)?.direction ?? 'neutral';
      if (td !== 'neutral' && td !== dir) continue;
      const dd = Math.abs(daysBetween(t.date, row.date));
      if (dd > tol) continue;
      const refMatch = row.reference && t.reference && row.reference.trim() === t.reference.trim();
      const score = (refMatch ? 0 : 10) + dd;
      if (!best || score < best.score) best = { id: t.id, score };
    }
    if (best) {
      used.add(best.id);
      return { index, row, status: 'matched', matchTxnId: best.id };
    }

    // 2) duplicate within the import
    const key = `${row.date}|${abs}|${(row.reference ?? '').trim()}`;
    if (seen.has(key)) return { index, row, status: 'duplicate', note: `same as row ${seen.get(key)! + 1}` };
    seen.set(key, index);
    return { index, row, status: 'new' };
  });

  // 3) running-balance check (in statement order)
  let balanceMismatches = 0;
  let balanceCheck: ReconcileResult['balanceCheck'] = { ok: null };
  if (opts.openingBalancePaise != null && rows.some((r) => r.balancePaise != null)) {
    let running = opts.openingBalancePaise;
    for (const r of results) {
      running += r.row.amountPaise;
      if (r.row.balancePaise != null) {
        r.balanceOk = r.row.balancePaise === running;
        if (!r.balanceOk) balanceMismatches++;
      }
    }
    const statedClosing = opts.closingBalancePaise ?? [...rows].reverse().find((r) => r.balancePaise != null)?.balancePaise;
    balanceCheck = {
      openingPaise: opts.openingBalancePaise,
      computedClosingPaise: running,
      statedClosingPaise: statedClosing,
      ok: statedClosing != null ? statedClosing === running : null,
    };
  }

  return {
    results,
    summary: {
      matched: results.filter((r) => r.status === 'matched').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      newCount: results.filter((r) => r.status === 'new').length,
      balanceMismatches,
    },
    balanceCheck,
  };
}
