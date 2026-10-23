import type { Transaction } from '../db/types';
import { getTxnType } from './txnTypes';

export interface LedgerSummary {
  count: number;
  moneyInPaise: number;
  moneyOutPaise: number;
  netPaise: number;
}

/**
 * A quick in/out/net summary of a set of ledger rows, by each type's direction
 * (transfers and other neutral moves are excluded). This is the engine's own
 * definition of in/out, so the Transactions summary strip never re-derives it.
 */
export function summarizeLedger(txns: Transaction[]): LedgerSummary {
  let moneyIn = 0;
  let moneyOut = 0;
  let count = 0;
  for (const t of txns) {
    if (t.voided) continue;
    count += 1;
    const dir = getTxnType(t.type)?.direction ?? 'neutral';
    if (dir === 'in') moneyIn += t.amountPaise;
    else if (dir === 'out') moneyOut += t.amountPaise;
  }
  return { count, moneyInPaise: moneyIn, moneyOutPaise: moneyOut, netPaise: moneyIn - moneyOut };
}
