import type { ReimbursementPolicy, Split, Transaction } from '../db/types';
import { clamp, percentOf, type Paise } from './money';

export interface ClassifyCtx {
  policies: ReimbursementPolicy[];
}

/** The effective purpose/category of a line (split value, else the parent txn). */
function dims(part: Partial<Split>, txn: Transaction) {
  return {
    purposeId: part.purposeId ?? txn.purposeId,
    categoryId: part.categoryId ?? txn.categoryId,
    subcategoryId: part.subcategoryId ?? txn.subcategoryId,
  };
}

function matches(policy: ReimbursementPolicy, d: ReturnType<typeof dims>, date: string): boolean {
  if (!policy.active) return false;
  if (policy.validFrom && date < policy.validFrom) return false;
  if (policy.validTo && date > policy.validTo) return false;
  if (policy.matchPurposeId && policy.matchPurposeId !== d.purposeId) return false;
  if (policy.matchCategoryId && policy.matchCategoryId !== d.categoryId) return false;
  if (policy.matchSubcategoryId && policy.matchSubcategoryId !== d.subcategoryId) return false;
  return true;
}

/** How "specific" a policy is — more matched dimensions wins ties. */
function specificity(p: ReimbursementPolicy): number {
  return (p.matchPurposeId ? 1 : 0) + (p.matchCategoryId ? 1 : 0) + (p.matchSubcategoryId ? 1 : 0);
}

export function findPolicy(part: Partial<Split>, txn: Transaction, ctx: ClassifyCtx): ReimbursementPolicy | undefined {
  if (txn.policyId) {
    const explicit = ctx.policies.find((p) => p.id === txn.policyId);
    if (explicit) return explicit;
  }
  const d = dims(part, txn);
  const candidates = ctx.policies.filter((p) => matches(p, d, txn.date));
  if (!candidates.length) return undefined;
  return candidates.sort((a, b) => specificity(b) - specificity(a))[0];
}

/**
 * Claimable amount for a reimbursable line. A matching policy applies its
 * percent and/or fixed amount, capped at maxPaise and never more than spent.
 * A reimbursable line with no matching policy defaults to 100% claimable.
 */
export function policyClaimable(part: Partial<Split> & { amountPaise: Paise }, txn: Transaction, ctx: ClassifyCtx): Paise {
  const base = part.amountPaise;
  const policy = findPolicy(part, txn, ctx);
  if (!policy) return base; // reimbursable but no policy → expect it all back

  let claim = 0;
  let specified = false;
  if (policy.percent != null) {
    claim += percentOf(base, policy.percent);
    specified = true;
  }
  if (policy.fixedPaise != null) {
    claim += policy.fixedPaise;
    specified = true;
  }
  if (!specified) claim = base;
  if (policy.maxPaise != null) claim = Math.min(claim, policy.maxPaise);
  return clamp(claim, 0, base);
}
