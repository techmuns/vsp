import type { TxnFilter } from './txnFilter';

// A one-shot hand-off so other pages can open Transactions pre-filtered.
let pending: Partial<TxnFilter> | null = null;

export function setPendingTxnFilter(f: Partial<TxnFilter> | null): void {
  pending = f;
}

/** Read and clear the pending filter (consumed once by the Transactions page). */
export function takePendingTxnFilter(): Partial<TxnFilter> | null {
  const p = pending;
  pending = null;
  return p;
}
