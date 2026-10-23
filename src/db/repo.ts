import { db } from './db';
import { newId, nowTs, todayISO } from './ids';
import type {
  Account,
  AppEvent,
  Budget,
  Category,
  Goal,
  Investment,
  Person,
  Price,
  Purpose,
  ReimbursementClaim,
  ReimbursementPolicy,
  Settings,
  Split,
  Transaction,
} from './types';

export const DEFAULT_SALARY_DAY = 11;

/* ---------------------------------------------------------------- settings */

export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get('app');
}

export async function ensureSeeded(): Promise<Settings> {
  const existing = await db.settings.get('app');
  if (existing) return existing;

  const settings: Settings = {
    id: 'app',
    salaryCycleStartDay: DEFAULT_SALARY_DAY,
    startDate: todayISO(),
    demoMode: false,
    aiEnabled: false,
    currency: 'INR',
    schemaVersion: 1,
  };
  await db.settings.put(settings);

  // Seed purposes Office + Personal as soft, editable, deletable defaults.
  const count = await db.purposes.count();
  if (count === 0) {
    const ts = nowTs();
    await db.purposes.bulkAdd([
      { id: newId('pur'), name: 'Office', active: true, createdAt: ts, updatedAt: ts },
      { id: newId('pur'), name: 'Personal', active: true, createdAt: ts, updatedAt: ts },
    ]);
  }
  return settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = (await db.settings.get('app')) ?? (await ensureSeeded());
  await db.settings.put({ ...cur, ...patch, id: 'app' });
}

/* ------------------------------------------------------ generic entity CRUD */

type Stamped = { id: string; createdAt: number; updatedAt: number; active: boolean };

function stamp<T extends Partial<Stamped>>(input: T, prefix: string): T & Stamped {
  const ts = nowTs();
  return {
    active: true,
    ...input,
    id: input.id ?? newId(prefix),
    createdAt: input.createdAt ?? ts,
    updatedAt: ts,
  } as T & Stamped;
}

export async function saveAccount(input: Partial<Account> & { name: string; type: Account['type'] }): Promise<Account> {
  const rec = stamp<Partial<Account>>(
    { openingBalancePaise: 0, openingDate: todayISO(), currency: 'INR', ...input },
    'acc'
  ) as Account;
  await db.accounts.put(rec);
  return rec;
}

export async function savePerson(input: Partial<Person> & { name: string }): Promise<Person> {
  const rec = stamp<Partial<Person>>(input, 'per') as Person;
  await db.people.put(rec);
  return rec;
}

export async function saveCategory(
  input: Partial<Category> & { name: string; kind: Category['kind'] }
): Promise<Category> {
  const rec = stamp<Partial<Category>>(input, 'cat') as Category;
  await db.categories.put(rec);
  return rec;
}

export async function savePurpose(input: Partial<Purpose> & { name: string }): Promise<Purpose> {
  const rec = stamp<Partial<Purpose>>(input, 'pur') as Purpose;
  await db.purposes.put(rec);
  return rec;
}

export async function savePolicy(input: Partial<ReimbursementPolicy> & { name: string }): Promise<ReimbursementPolicy> {
  const rec = stamp<Partial<ReimbursementPolicy>>(input, 'pol') as ReimbursementPolicy;
  await db.reimbursementPolicies.put(rec);
  return rec;
}

export async function saveInvestment(
  input: Partial<Investment> & { name: string; platform: string; assetType: Investment['assetType'] }
): Promise<Investment> {
  const rec = stamp<Partial<Investment>>(input, 'inv') as Investment;
  await db.investments.put(rec);
  return rec;
}

export async function saveEvent(input: Partial<AppEvent> & { name: string }): Promise<AppEvent> {
  const rec = stamp<Partial<AppEvent>>(input, 'evt') as AppEvent;
  await db.events.put(rec);
  return rec;
}

export async function saveGoal(input: Partial<Goal> & { name: string; targetPaise: number }): Promise<Goal> {
  const rec = stamp<Partial<Goal>>(input, 'goal') as Goal;
  await db.goals.put(rec);
  return rec;
}

export async function saveBudget(input: Partial<Budget> & { scope: Budget['scope']; period: string; amountPaise: number }): Promise<Budget> {
  const rec = stamp<Partial<Budget>>(input, 'bud') as Budget;
  await db.budgets.put(rec);
  return rec;
}

export async function setActive(
  table: 'accounts' | 'people' | 'categories' | 'purposes' | 'reimbursementPolicies' | 'investments' | 'events' | 'goals' | 'budgets',
  id: string,
  active: boolean
): Promise<void> {
  await (db[table] as typeof db.accounts).update(id, { active, updatedAt: nowTs() } as Partial<Account>);
}

export async function upsertPrice(input: Omit<Price, 'id'>): Promise<Price> {
  const rec: Price = { ...input, id: `${input.investmentId}:${input.date}` };
  await db.prices.put(rec);
  return rec;
}

/* ------------------------------------------------------------- transactions */

export function validateSplits(amountPaise: number, splits: Pick<Split, 'amountPaise'>[]): boolean {
  if (!splits.length) return true;
  const sum = splits.reduce((s, x) => s + x.amountPaise, 0);
  return sum === amountPaise;
}

export interface NewTxnInput extends Partial<Transaction> {
  type: string;
  amountPaise: number;
}

/** Add a transaction (+ optional splits) atomically, through one write path. */
export async function addTransaction(
  input: NewTxnInput,
  splits: Array<Partial<Split> & { amountPaise: number }> = []
): Promise<Transaction> {
  const ts = nowTs();
  const txn: Transaction = {
    date: todayISO(),
    status: 'cleared',
    ...input,
    id: input.id ?? newId('txn'),
    amountPaise: Math.round(input.amountPaise),
    createdAt: input.createdAt ?? ts,
    updatedAt: ts,
  };

  if (splits.length && !validateSplits(txn.amountPaise, splits)) {
    throw new Error('Splits must add up to the transaction amount.');
  }

  await db.transaction('rw', db.transactions, db.splits, db.auditLog, async () => {
    await db.transactions.put(txn);
    if (splits.length) {
      await db.splits.bulkPut(
        splits.map((s) => ({ ...s, id: s.id ?? newId('spl'), txnId: txn.id, amountPaise: Math.round(s.amountPaise) }))
      );
    }
    await db.auditLog.put({ id: newId('aud'), txnId: txn.id, at: ts, action: 'create', entity: 'transaction', after: txn });
  });
  return txn;
}

export async function updateTransaction(id: string, patch: Partial<Transaction>, splits?: Array<Partial<Split> & { amountPaise: number }>): Promise<void> {
  const ts = nowTs();
  await db.transaction('rw', db.transactions, db.splits, db.auditLog, async () => {
    const before = await db.transactions.get(id);
    if (!before) return;
    const after: Transaction = { ...before, ...patch, id, updatedAt: ts };
    if (splits && !validateSplits(after.amountPaise, splits)) {
      throw new Error('Splits must add up to the transaction amount.');
    }
    await db.transactions.put(after);
    if (splits) {
      await db.splits.where('txnId').equals(id).delete();
      if (splits.length) {
        await db.splits.bulkPut(splits.map((s) => ({ ...s, id: s.id ?? newId('spl'), txnId: id, amountPaise: Math.round(s.amountPaise) })));
      }
    }
    await db.auditLog.put({ id: newId('aud'), txnId: id, at: ts, action: 'update', entity: 'transaction', before, after });
  });
}

/** Soft-void a transaction: it stops affecting figures but history is kept. */
export async function voidTransaction(id: string): Promise<void> {
  const ts = nowTs();
  await db.transaction('rw', db.transactions, db.auditLog, async () => {
    const before = await db.transactions.get(id);
    if (!before) return;
    await db.transactions.update(id, { voided: true, updatedAt: ts });
    await db.auditLog.put({ id: newId('aud'), txnId: id, at: ts, action: 'void', entity: 'transaction', before });
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.splits, db.auditLog, async () => {
    const before = await db.transactions.get(id);
    await db.splits.where('txnId').equals(id).delete();
    await db.transactions.delete(id);
    await db.auditLog.put({ id: newId('aud'), txnId: id, at: nowTs(), action: 'delete', entity: 'transaction', before });
  });
}

export async function getSplits(txnId: string): Promise<Split[]> {
  return db.splits.where('txnId').equals(txnId).toArray();
}

/* --------------------------------------------------------------- demo data */

const DEMO_TABLES = [
  'accounts',
  'transactions',
  'splits',
  'people',
  'categories',
  'purposes',
  'reimbursementPolicies',
  'reimbursementClaims',
  'investments',
  'holdingLots',
  'investmentTxns',
  'goals',
  'budgets',
  'recurring',
  'events',
] as const;

/** Remove every demo-tagged record in one go. Real data is untouched. */
export async function clearDemoData(): Promise<void> {
  await db.transaction('rw', DEMO_TABLES.map((t) => db[t]), async () => {
    for (const t of DEMO_TABLES) {
      // splits have no `demo` flag; clear by their (demo) parent txns
      if (t === 'splits') continue;
      await (db[t] as typeof db.accounts).filter((r: { demo?: boolean }) => r.demo === true).delete();
    }
    // orphaned splits whose txn is gone
    const txnIds = new Set((await db.transactions.toArray()).map((x) => x.id));
    const orphanSplits = await db.splits.filter((s) => !txnIds.has(s.txnId)).primaryKeys();
    if (orphanSplits.length) await db.splits.bulkDelete(orphanSplits);
    // prices for demo investments
    const invIds = new Set((await db.investments.toArray()).map((x) => x.id));
    const orphanPrices = await db.prices.filter((p) => !invIds.has(p.investmentId)).primaryKeys();
    if (orphanPrices.length) await db.prices.bulkDelete(orphanPrices);
  });
  await updateSettings({ demoMode: false });
}

export async function hasDemoData(): Promise<boolean> {
  return (await db.transactions.filter((t) => t.demo === true).count()) > 0 || (await db.accounts.filter((a) => a.demo === true).count()) > 0;
}

export async function saveClaim(input: Partial<ReimbursementClaim> & { periodStart: string; periodEnd: string; amountPaise: number }): Promise<ReimbursementClaim> {
  const ts = nowTs();
  const rec: ReimbursementClaim = {
    txnIds: [],
    status: 'draft',
    ...input,
    id: input.id ?? newId('clm'),
    createdAt: input.createdAt ?? ts,
    updatedAt: ts,
  };
  await db.reimbursementClaims.put(rec);
  return rec;
}

export async function updateClaim(id: string, patch: Partial<ReimbursementClaim>): Promise<void> {
  await db.reimbursementClaims.update(id, { ...patch, updatedAt: nowTs() });
}

export async function deleteClaim(id: string): Promise<void> {
  await db.reimbursementClaims.delete(id);
}

/** Hard-delete a record from a configurable (non-transaction) table. */
export async function removeEntity(
  table: 'reimbursementPolicies' | 'budgets' | 'events' | 'goals' | 'investments' | 'people' | 'categories' | 'purposes' | 'accounts',
  id: string
): Promise<void> {
  await (db[table] as typeof db.budgets).delete(id);
}

/* ------------------------------------------------------------ saved filters */

export async function saveTxnFilter(name: string, filter: Record<string, unknown>): Promise<string> {
  const cur = (await db.settings.get('app')) ?? (await ensureSeeded());
  const list = cur.savedTxnFilters ?? [];
  const existing = list.find((f) => f.name === name);
  const id = existing?.id ?? newId('flt');
  const next = existing ? list.map((f) => (f.id === id ? { id, name, filter } : f)) : [...list, { id, name, filter }];
  await db.settings.put({ ...cur, savedTxnFilters: next });
  return id;
}

export async function removeTxnFilter(id: string): Promise<void> {
  const cur = await db.settings.get('app');
  if (!cur) return;
  await db.settings.put({ ...cur, savedTxnFilters: (cur.savedTxnFilters ?? []).filter((f) => f.id !== id) });
}

/* ------------------------------------------------------------- danger zone */

/** Wipe EVERYTHING (demo + real). Used from Settings with a confirm. */
export async function wipeAll(): Promise<void> {
  await db.delete();
  await db.open();
  await ensureSeeded();
}

export async function isEmpty(): Promise<boolean> {
  const [accts, txns] = await Promise.all([db.accounts.count(), db.transactions.count()]);
  return accts === 0 && txns === 0;
}
