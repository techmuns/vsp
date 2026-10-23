import { useMemo } from 'react';
import type { Dataset } from '../db/hooks';
import { computeSnapshot, type EngineInput, type Snapshot } from '../engine';
import type { DateRange } from '../lib/dates';

export function datasetToEngineInput(d: Dataset): EngineInput {
  return {
    transactions: d.transactions,
    splits: d.splits,
    accounts: d.accounts,
    policies: d.policies,
    claims: d.claims,
    investments: d.investments,
    prices: d.prices,
  };
}

/** Memoised engine snapshot for the current dataset + date range. */
export function useSnapshot(dataset: Dataset | undefined, range: DateRange): Snapshot | null {
  return useMemo(() => {
    if (!dataset) return null;
    return computeSnapshot(datasetToEngineInput(dataset), range);
  }, [dataset, range]);
}
