import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Transaction,
  Split,
  Person,
  Category,
  Purpose,
  ReimbursementPolicy,
  ReimbursementClaim,
  Investment,
  HoldingLot,
  InvestmentTxn,
  Price,
  Goal,
  Budget,
  Recurring,
  AppEvent,
  Settings,
  AuditLog,
} from './types';

export const SCHEMA_VERSION = 1;

/**
 * The local, single-user finance database. Everything lives in the browser
 * (IndexedDB) — nothing is ever uploaded.
 *
 * Migrations: bump with `db.version(n).stores({...}).upgrade(tx => ...)`.
 * Dexie preserves existing object stores and their data across version
 * upgrades, so an upgrade NEVER wipes the user's records.
 */
export class KoshDB extends Dexie {
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  splits!: Table<Split, string>;
  people!: Table<Person, string>;
  categories!: Table<Category, string>;
  purposes!: Table<Purpose, string>;
  reimbursementPolicies!: Table<ReimbursementPolicy, string>;
  reimbursementClaims!: Table<ReimbursementClaim, string>;
  investments!: Table<Investment, string>;
  holdingLots!: Table<HoldingLot, string>;
  investmentTxns!: Table<InvestmentTxn, string>;
  prices!: Table<Price, string>;
  goals!: Table<Goal, string>;
  budgets!: Table<Budget, string>;
  recurring!: Table<Recurring, string>;
  events!: Table<AppEvent, string>;
  settings!: Table<Settings, string>;
  auditLog!: Table<AuditLog, string>;

  constructor() {
    super('kosh');
    this.version(1).stores({
      accounts: 'id, type, active, name, demo',
      transactions: 'id, date, type, accountId, counterAccountId, categoryId, personId, investmentId, status, voided, demo, [date+type]',
      splits: 'id, txnId',
      people: 'id, active, name, demo',
      categories: 'id, parentId, kind, active, demo',
      purposes: 'id, active, demo',
      reimbursementPolicies: 'id, active, demo',
      reimbursementClaims: 'id, status, demo',
      investments: 'id, platform, assetType, active, demo',
      holdingLots: 'id, investmentId, demo',
      investmentTxns: 'id, investmentId, date, kind, demo',
      prices: 'id, investmentId, date',
      goals: 'id, active, demo',
      budgets: 'id, scope, active, demo',
      recurring: 'id, active, nextDate, demo',
      events: 'id, active, demo',
      settings: 'id',
      auditLog: 'id, txnId, at, entity',
    });
  }
}

export const db = new KoshDB();
