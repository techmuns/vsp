// Pure settle-up maths for the People page. A single repayment can clear one or
// several outstanding items (partial or full); an item can be cleared by several
// repayments over time. Nothing here is income — it only reduces balances.

export interface SettleItem {
  id: string;
  outstandingPaise: number;
}

export interface Allocation {
  id: string;
  appliedPaise: number;
  remainingPaise: number;
}

export interface SettlementResult {
  allocations: Allocation[];
  /** Amount of the payment not applied to any item (overpayment). */
  leftoverPaise: number;
  appliedPaise: number;
}

/**
 * Allocate `amountPaise` across `items` in the given order (oldest-first by
 * default — pass items pre-sorted). Each item absorbs at most its outstanding,
 * so one payment settling several items never double-counts, and a partial
 * payment leaves the rest tracked as remaining.
 */
export function allocateSettlement(items: SettleItem[], amountPaise: number): SettlementResult {
  let remaining = Math.max(0, Math.round(amountPaise));
  let applied = 0;
  const allocations: Allocation[] = items.map((it) => {
    const owed = Math.max(0, it.outstandingPaise);
    const apply = Math.min(owed, remaining);
    remaining -= apply;
    applied += apply;
    return { id: it.id, appliedPaise: apply, remainingPaise: owed - apply };
  });
  return { allocations, leftoverPaise: remaining, appliedPaise: applied };
}

/** Net two directed balances into a single signed figure (>0 = owed to you). */
export function netBalance(receivablePaise: number, payablePaise: number): number {
  return receivablePaise - payablePaise;
}
