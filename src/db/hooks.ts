import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type {
  Account,
  AppEvent,
  Budget,
  Category,
  Goal,
  Investment,
  InvestmentTxn,
  Person,
  Price,
  Purpose,
  ReimbursementClaim,
  ReimbursementPolicy,
  Settings,
  Split,
  Transaction,
} from './types';

/** Everything the engine + screens read. One subscription, fully reactive. */
export interface Dataset {
  settings: Settings | null;
  accounts: Account[];
  transactions: Transaction[];
  splits: Split[];
  people: Person[];
  categories: Category[];
  purposes: Purpose[];
  policies: ReimbursementPolicy[];
  claims: ReimbursementClaim[];
  investments: Investment[];
  investmentTxns: InvestmentTxn[];
  prices: Price[];
  goals: Goal[];
  budgets: Budget[];
  events: AppEvent[];
}

export function useDataset(): Dataset | undefined {
  return useLiveQuery(async () => {
    const [
      settings,
      accounts,
      transactions,
      splits,
      people,
      categories,
      purposes,
      policies,
      claims,
      investments,
      investmentTxns,
      prices,
      goals,
      budgets,
      events,
    ] = await Promise.all([
      db.settings.get('app'),
      db.accounts.toArray(),
      db.transactions.toArray(),
      db.splits.toArray(),
      db.people.toArray(),
      db.categories.toArray(),
      db.purposes.toArray(),
      db.reimbursementPolicies.toArray(),
      db.reimbursementClaims.toArray(),
      db.investments.toArray(),
      db.investmentTxns.toArray(),
      db.prices.toArray(),
      db.goals.toArray(),
      db.budgets.toArray(),
      db.events.toArray(),
    ]);
    return {
      settings: settings ?? null,
      accounts,
      transactions,
      splits,
      people,
      categories,
      purposes,
      policies,
      claims,
      investments,
      investmentTxns,
      prices,
      goals,
      budgets,
      events,
    } satisfies Dataset;
  }, []);
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get('app'), []);
}
