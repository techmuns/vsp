// Test factories. These build USER-ENTERED records (the §5 test scenarios);
// nothing here is app content — it stands in for data a person would enter.
import type {
  Account,
  AccountType,
  Investment,
  Person,
  Price,
  ReimbursementPolicy,
  Split,
  Transaction,
} from '../../db/types';
import type { EngineInput } from '../compute';
import { computeSnapshot } from '../compute';
import type { DateRange } from '../../lib/dates';

export const R = (rupees: number): number => Math.round(rupees * 100);

let seq = 0;
const uid = (p: string) => `${p}_${++seq}`;

export function acc(id: string, type: AccountType, openingPaise = 0, openingDate = '2026-01-01'): Account {
  return {
    id,
    name: id,
    type,
    openingBalancePaise: openingPaise,
    openingDate,
    currency: 'INR',
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function txn(input: Partial<Transaction> & { type: string; amountPaise: number }): Transaction {
  return {
    id: input.id ?? uid('txn'),
    date: '2026-10-11',
    status: 'cleared',
    createdAt: seq,
    updatedAt: seq,
    ...input,
  };
}

export function split(txnId: string, input: Partial<Split> & { amountPaise: number }): Split {
  return { id: uid('spl'), txnId, ...input };
}

export function person(id: string): Person {
  return { id, name: id, active: true, createdAt: 0, updatedAt: 0 };
}

export function policy(input: Partial<ReimbursementPolicy> & { name: string }): ReimbursementPolicy {
  return { id: input.id ?? uid('pol'), active: true, createdAt: 0, updatedAt: 0, ...input };
}

export function inv(id: string, input: Partial<Investment> = {}): Investment {
  return {
    id,
    name: id,
    platform: input.platform ?? 'Broker',
    assetType: input.assetType ?? 'stock',
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...input,
  };
}

export function price(investmentId: string, date: string, pricePaise: number): Price {
  return { id: `${investmentId}:${date}`, investmentId, date, pricePaise, source: 'manual', asOf: date };
}

export function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    transactions: [],
    splits: [],
    accounts: [],
    policies: [],
    claims: [],
    investments: [],
    prices: [],
    ...over,
  };
}

export const FULL_YEAR: DateRange = { from: '2026-01-01', to: '2026-12-31' };

export function run(inp: EngineInput, range: DateRange = FULL_YEAR) {
  return computeSnapshot(inp, range);
}

export function balOf(snap: ReturnType<typeof computeSnapshot>, accountId: string): number {
  return snap.balances.find((b) => b.account.id === accountId)?.balancePaise ?? 0;
}
