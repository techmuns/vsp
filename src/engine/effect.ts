import type { Paise } from './money';

/**
 * The normalized result of classifying ONE transaction. Each field is a signed
 * paise contribution. The aggregators sum these up — position fields over all
 * transactions dated on/before an as-of date, flow fields over a date range.
 *
 * This is the ONLY place the "debit/credit" shape of money is modelled, and it
 * never leaves the engine. The UI only ever sees friendly totals.
 */
export interface Effect {
  // ---- POSITIONS (summed over date ≤ asOf) ----
  /** Cash position delta per account. For a credit card, a negative delta = you owe more. */
  account: Record<string, Paise>;
  /** Amount owed TO you, per person. */
  receivable: Record<string, Paise>;
  /** Amount you OWE, per person. */
  payable: Record<string, Paise>;

  // ---- FLOWS (summed over date within range) ----
  /** Income received (excludes reimbursements and transfers). */
  income: Paise;
  incomeByCategory: Record<string, Paise>;
  /** Net personal expense (gross − claimable − friends' shares). */
  expense: Paise;
  /** Gross personal expense (your portion, before reimbursements). */
  grossExpense: Paise;
  expenseByCategory: Record<string, Paise>;
  /** Net new money moved into investments (buys/contributions − sells/withdrawals). */
  invested: Paise;

  // ---- REIMBURSEMENTS (behave as a flow, and accumulate into the outstanding position) ----
  /** Gross reimbursable expense (the part eligible to claim). */
  reimbEligibleGross: Paise;
  /** Amount claimable after applying the policy (% / fixed / cap). */
  reimbClaimable: Paise;
  /** Amount actually received back. */
  reimbReceived: Paise;
}

export function emptyEffect(): Effect {
  return {
    account: {},
    receivable: {},
    payable: {},
    income: 0,
    incomeByCategory: {},
    expense: 0,
    grossExpense: 0,
    expenseByCategory: {},
    invested: 0,
    reimbEligibleGross: 0,
    reimbClaimable: 0,
    reimbReceived: 0,
  };
}
