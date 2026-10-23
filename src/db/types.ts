// Shared domain record types. PURE type declarations only — no runtime code,
// no Dexie import — so the finance engine can import these without pulling in
// the database. Every amount is INTEGER PAISE.

export type ID = string;
export type ISODate = string; // 'YYYY-MM-DD'
export type Timestamp = number; // epoch milliseconds
export type Paise = number; // integer paise

export type AccountType = 'bank' | 'cash' | 'credit_card' | 'broker_cash' | 'other';

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  /** Name of the bank / card issuer / broker — dynamic, never hardcoded. */
  institution?: string;
  openingBalancePaise: Paise;
  openingDate: ISODate;
  currency: 'INR';
  creditLimitPaise?: Paise; // credit cards
  colorKey?: string;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TxnStatus = 'cleared' | 'pending' | 'scheduled';

/**
 * The universal money ledger row. `type` is an extensible string id resolved by
 * the engine's transaction-type registry — adding a new type never requires
 * changing this shape.
 */
export interface Transaction {
  id: ID;
  date: ISODate;
  type: string;
  amountPaise: Paise;
  description?: string;
  categoryId?: ID;
  subcategoryId?: ID;
  purposeId?: ID;
  accountId?: ID;
  counterAccountId?: ID;
  personId?: ID;
  investmentId?: ID;
  units?: number; // investment buy/sell unit count
  status: TxnStatus;
  reference?: string;
  linkedTxnId?: ID; // e.g. a repayment → its original loan
  eventId?: ID;
  tags?: string[];
  notes?: string;
  /** On an expense: the amount is claimable from an employer (uses a policy).
   *  On an income: this credit is money coming BACK (a reimbursement receipt). */
  reimbursable?: boolean;
  policyId?: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  voided?: boolean;
  demo?: boolean;
}

/** A line within a transaction. Sum of a txn's splits MUST equal its amount. */
export interface Split {
  id: ID;
  txnId: ID;
  categoryId?: ID;
  subcategoryId?: ID;
  purposeId?: ID;
  personId?: ID;
  amountPaise: Paise;
  reimbursable?: boolean;
  note?: string;
}

export interface Person {
  id: ID;
  name: string;
  contact?: string;
  notes?: string;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CategoryKind = 'expense' | 'income' | 'other';

export interface Category {
  id: ID;
  name: string;
  parentId?: ID; // category → subcategory via parentId
  colorKey?: string;
  kind: CategoryKind;
  icon?: string;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Purpose {
  id: ID;
  name: string;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ReimbursementPolicy {
  id: ID;
  name: string;
  matchCategoryId?: ID;
  matchSubcategoryId?: ID;
  matchPurposeId?: ID;
  percent?: number; // 0..100
  fixedPaise?: Paise;
  maxPaise?: Paise; // cap per claim/txn
  validFrom?: ISODate;
  validTo?: ISODate;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'received' | 'rejected';

export interface ReimbursementClaim {
  id: ID;
  periodStart: ISODate;
  periodEnd: ISODate;
  txnIds: ID[];
  amountPaise: Paise;
  status: ClaimStatus;
  submittedAt?: Timestamp;
  receivedPaise?: Paise;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AssetType = 'stock' | 'mutual_fund' | 'etf' | 'other';

export interface Investment {
  id: ID;
  platform: string; // broker / platform name — dynamic
  assetType: AssetType;
  name: string;
  symbol?: string;
  isin?: string;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface HoldingLot {
  id: ID;
  investmentId: ID;
  buyDate: ISODate;
  units: number;
  costPaise: Paise;
  demo?: boolean;
}

export type InvestmentTxnKind = 'buy' | 'sell' | 'sip' | 'dividend' | 'charge';

export interface InvestmentTxn {
  id: ID;
  investmentId: ID;
  date: ISODate;
  kind: InvestmentTxnKind;
  units?: number;
  amountPaise: Paise;
  accountId?: ID;
  demo?: boolean;
}

export interface Price {
  id: ID; // `${investmentId}:${date}`
  investmentId: ID;
  date: ISODate;
  pricePaise: Paise;
  source: string;
  asOf: ISODate;
}

export interface Goal {
  id: ID;
  name: string;
  targetPaise: Paise;
  targetDate?: ISODate;
  linkedAccountIds?: ID[];
  savedPaise?: Paise;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BudgetScope = 'overall' | 'category' | 'event';

export interface Budget {
  id: ID;
  scope: BudgetScope;
  refId?: ID;
  period: string; // e.g. '2026-10' or 'monthly'
  amountPaise: Paise;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RecurringMode = 'reminder' | 'draft' | 'auto';

export interface Recurring {
  id: ID;
  template: Partial<Transaction>;
  schedule: string; // cron-ish or 'monthly:11'
  mode: RecurringMode;
  nextDate: ISODate;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AppEvent {
  id: ID;
  name: string;
  notes?: string;
  active: boolean;
  demo?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Settings {
  id: 'app';
  salaryCycleStartDay: number; // default 11, editable
  startDate: ISODate;
  demoMode: boolean;
  aiEnabled: false;
  currency: 'INR';
  onboardedAt?: Timestamp;
  schemaVersion: number;
}

export interface AuditLog {
  id: ID;
  txnId?: ID;
  entity?: string;
  at: Timestamp;
  action: string;
  before?: unknown;
  after?: unknown;
}
