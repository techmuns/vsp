import type { Goal } from '../db/types';
import { daysBetween, type ISODate } from '../lib/dates';
import { clamp } from './money';

export interface GoalProgress {
  savedPaise: number;
  targetPaise: number;
  pct: number;
  remainingPaise: number;
  /** true = ahead of the pace needed to hit the date, false = behind, null = no date. */
  onTrack: boolean | null;
}

/** Progress toward a goal. `savedPaise` may come from linked balances (passed in). */
export function goalProgress(goal: Goal, opts: { savedPaise?: number; startDate?: ISODate; today?: ISODate } = {}): GoalProgress {
  const saved = opts.savedPaise ?? goal.savedPaise ?? 0;
  const target = goal.targetPaise;
  const pct = target > 0 ? (saved / target) * 100 : saved > 0 ? 100 : 0;
  let onTrack: boolean | null = null;
  if (goal.targetDate && opts.startDate && opts.today) {
    const total = daysBetween(opts.startDate, goal.targetDate);
    const elapsed = daysBetween(opts.startDate, opts.today);
    if (total > 0) {
      const elapsedPct = clamp(elapsed / total, 0, 1) * 100;
      onTrack = pct >= elapsedPct;
    }
  }
  return { savedPaise: saved, targetPaise: target, pct, remainingPaise: Math.max(0, target - saved), onTrack };
}

/** Accounts linked to more than one active goal (double-counting risk). */
export function goalAllocationConflicts(goals: Goal[]): string[] {
  const count: Record<string, number> = {};
  for (const g of goals) {
    if (!g.active) continue;
    for (const id of g.linkedAccountIds ?? []) count[id] = (count[id] ?? 0) + 1;
  }
  return Object.keys(count).filter((id) => count[id] > 1);
}
