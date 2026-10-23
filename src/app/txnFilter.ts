import type { Transaction, TxnStatus } from '../db/types';
import { inRange, type DateRange } from '../lib/dates';

export type ReimbFilter = 'any' | 'reimbursable' | 'not';

/** A fully serialisable Transactions filter (safe to save to the DB). */
export interface TxnFilter {
  search: string;
  ignoreRange: boolean;
  showVoided: boolean;
  types: string[];
  categoryIds: string[];
  purposeIds: string[];
  personIds: string[];
  accountIds: string[];
  eventIds: string[];
  tags: string[];
  statuses: TxnStatus[];
  reimb: ReimbFilter;
  minPaise: number | null;
  maxPaise: number | null;
}

export function emptyFilter(): TxnFilter {
  return {
    search: '',
    ignoreRange: false,
    showVoided: false,
    types: [],
    categoryIds: [],
    purposeIds: [],
    personIds: [],
    accountIds: [],
    eventIds: [],
    tags: [],
    statuses: [],
    reimb: 'any',
    minPaise: null,
    maxPaise: null,
  };
}

/** How many filters are active (drives the "N active" badge and clear-all). */
export function countActiveFilters(f: TxnFilter): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.ignoreRange) n++;
  if (f.showVoided) n++;
  n += f.types.length ? 1 : 0;
  n += f.categoryIds.length ? 1 : 0;
  n += f.purposeIds.length ? 1 : 0;
  n += f.personIds.length ? 1 : 0;
  n += f.accountIds.length ? 1 : 0;
  n += f.eventIds.length ? 1 : 0;
  n += f.tags.length ? 1 : 0;
  n += f.statuses.length ? 1 : 0;
  if (f.reimb !== 'any') n++;
  if (f.minPaise != null || f.maxPaise != null) n++;
  return n;
}

function matchesSearch(t: Transaction, q: string): boolean {
  if (!q) return true;
  const hay = `${t.description ?? ''} ${t.reference ?? ''} ${t.notes ?? ''} ${(t.tags ?? []).join(' ')}`.toLowerCase();
  return hay.includes(q);
}

/** Apply the filter to the ledger. Pure — used by the page and any summary. */
export function applyTxnFilter(txns: Transaction[], f: TxnFilter, range: DateRange): Transaction[] {
  const q = f.search.trim().toLowerCase();
  return txns.filter((t) => {
    if (t.voided && !f.showVoided) return false;
    if (!f.ignoreRange && !inRange(t.date, range.from, range.to)) return false;
    if (!matchesSearch(t, q)) return false;
    if (f.types.length && !f.types.includes(t.type)) return false;
    if (f.categoryIds.length && !(f.categoryIds.includes(t.categoryId ?? '') || f.categoryIds.includes(t.subcategoryId ?? ''))) return false;
    if (f.purposeIds.length && !f.purposeIds.includes(t.purposeId ?? '')) return false;
    if (f.personIds.length && !f.personIds.includes(t.personId ?? '')) return false;
    if (f.accountIds.length && !(f.accountIds.includes(t.accountId ?? '') || f.accountIds.includes(t.counterAccountId ?? ''))) return false;
    if (f.eventIds.length && !f.eventIds.includes(t.eventId ?? '')) return false;
    if (f.tags.length && !(t.tags ?? []).some((tag) => f.tags.includes(tag))) return false;
    if (f.statuses.length && !f.statuses.includes(t.status)) return false;
    if (f.reimb === 'reimbursable' && !t.reimbursable) return false;
    if (f.reimb === 'not' && t.reimbursable) return false;
    if (f.minPaise != null && t.amountPaise < f.minPaise) return false;
    if (f.maxPaise != null && t.amountPaise > f.maxPaise) return false;
    return true;
  });
}
