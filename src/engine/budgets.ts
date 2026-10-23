import type { Budget } from '../db/types';

export type BudgetState = 'ok' | 'warn' | 'over';

export interface BudgetProgress {
  budgetPaise: number;
  actualPaise: number;
  remainingPaise: number;
  overPaise: number;
  pct: number;
  state: BudgetState;
}

/** Budget-vs-actual with simple traffic-light state (warn at 80%, over at 100%). */
export function budgetProgress(budgetPaise: number, actualPaise: number): BudgetProgress {
  const pct = budgetPaise > 0 ? (actualPaise / budgetPaise) * 100 : actualPaise > 0 ? Infinity : 0;
  return {
    budgetPaise,
    actualPaise,
    remainingPaise: budgetPaise - actualPaise,
    overPaise: Math.max(0, actualPaise - budgetPaise),
    pct,
    state: actualPaise > budgetPaise ? 'over' : pct >= 80 ? 'warn' : 'ok',
  };
}

/** The actual spend that a budget should be measured against, from already-
 *  computed engine figures (so there is no second definition of "spend"). */
export function budgetActual(
  budget: Pick<Budget, 'scope' | 'refId'>,
  figures: { overallPaise: number; byCategory: Record<string, number>; byEvent?: Record<string, number> }
): number {
  if (budget.scope === 'overall') return figures.overallPaise;
  if (budget.scope === 'category') return figures.byCategory[budget.refId ?? ''] ?? 0;
  if (budget.scope === 'event') return figures.byEvent?.[budget.refId ?? ''] ?? 0;
  return 0;
}
