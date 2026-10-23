import type { ReimbursementPolicy, Split, Transaction } from '../db/types';
import { classifyTxn } from './txnTypes';
import { allocateSettlement } from './settlement';

export interface PeopleInput {
  transactions: Transaction[];
  splits: Split[];
  policies: ReimbursementPolicy[];
}

export interface PersonPosition {
  receivablePaise: number;
  payablePaise: number;
  netPaise: number; // >0 they owe you, <0 you owe them
}

function splitMap(splits: Split[]): Map<string, Split[]> {
  const m = new Map<string, Split[]>();
  for (const s of splits) {
    const arr = m.get(s.txnId) ?? [];
    arr.push(s);
    m.set(s.txnId, arr);
  }
  return m;
}

/** Net receivable/payable per person, as of a date. */
export function personPositions(input: PeopleInput, asOf: string): Record<string, PersonPosition> {
  const sm = splitMap(input.splits);
  const recv: Record<string, number> = {};
  const pay: Record<string, number> = {};
  for (const t of input.transactions) {
    if (t.voided || t.date > asOf) continue;
    const e = classifyTxn(t, sm.get(t.id) ?? [], { policies: input.policies });
    for (const k in e.receivable) recv[k] = (recv[k] ?? 0) + e.receivable[k];
    for (const k in e.payable) pay[k] = (pay[k] ?? 0) + e.payable[k];
  }
  const ids = new Set([...Object.keys(recv), ...Object.keys(pay)]);
  const out: Record<string, PersonPosition> = {};
  for (const id of ids) {
    const r = recv[id] ?? 0;
    const p = pay[id] ?? 0;
    out[id] = { receivablePaise: r, payablePaise: p, netPaise: r - p };
  }
  return out;
}

export interface PersonEntry {
  txnId: string;
  date: string;
  type: string;
  description: string;
  amountPaise: number;
  /** Change to what they owe you: +increase, −repayment/forgiveness. */
  deltaPaise: number;
  runningPaise: number;
  dueDate?: string;
}

/** A dated ledger of everything with one person, with a running "owed to you". */
export function personLedger(input: PeopleInput, personId: string, asOf: string): { entries: PersonEntry[]; netPaise: number } {
  const sm = splitMap(input.splits);
  const rows: Omit<PersonEntry, 'runningPaise'>[] = [];
  for (const t of input.transactions) {
    if (t.voided || t.date > asOf) continue;
    const e = classifyTxn(t, sm.get(t.id) ?? [], { policies: input.policies });
    const delta = (e.receivable[personId] ?? 0) - (e.payable[personId] ?? 0);
    if (delta === 0) continue;
    rows.push({ txnId: t.id, date: t.date, type: t.type, description: t.description ?? '', amountPaise: t.amountPaise, deltaPaise: delta, dueDate: t.dueDate });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let running = 0;
  const entries: PersonEntry[] = rows.map((r) => {
    running += r.deltaPaise;
    return { ...r, runningPaise: running };
  });
  return { entries, netPaise: running };
}

export interface OpenItem {
  txnId: string;
  date: string;
  description: string;
  originalPaise: number;
  remainingPaise: number;
  dueDate?: string;
}

/**
 * Reconstruct which "debts" (amounts they took on) are still open, by applying
 * every repayment / write-off FIFO against them. This gives a correct
 * per-item remaining even when one debt is cleared by several payments.
 */
export function openItems(entries: PersonEntry[]): OpenItem[] {
  const debts = entries.filter((e) => e.deltaPaise > 0).map((e) => ({ txnId: e.txnId, date: e.date, description: e.description, originalPaise: e.deltaPaise, dueDate: e.dueDate }));
  const paymentsTotal = entries.filter((e) => e.deltaPaise < 0).reduce((s, e) => s + -e.deltaPaise, 0);
  const alloc = allocateSettlement(debts.map((d) => ({ id: d.txnId, outstandingPaise: d.originalPaise })), paymentsTotal);
  const remMap = new Map(alloc.allocations.map((a) => [a.id, a.remainingPaise]));
  return debts
    .map((d) => ({ ...d, remainingPaise: remMap.get(d.txnId) ?? d.originalPaise }))
    .filter((d) => d.remainingPaise > 0);
}
