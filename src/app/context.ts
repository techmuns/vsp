import { createContext, useContext } from 'react';
import type { Transaction } from '../db/types';
import type { Page } from './nav';
import type { TxnFilter } from './txnFilter';

export interface QuickAddPrefill {
  type?: string;
  accountId?: string;
  personId?: string;
  categoryId?: string;
}

/** Argument for the full transaction editor: an existing id to edit, or a
 *  prefill for a new, pre-typed entry (e.g. "lent to X"). */
export interface EditorArg {
  txnId?: string;
  prefill?: Partial<Transaction>;
}

export interface AppApi {
  goTo: (page: Page) => void;
  openQuickAdd: (prefill?: QuickAddPrefill) => void;
  openEditor: (arg?: EditorArg) => void;
  /** Jump to the Transactions page with an initial filter applied. */
  openTransactions: (filter?: Partial<TxnFilter>) => void;
  /** Open the guided statement importer overlay. */
  openImport: () => void;
  /** Open the optional AI batch categoriser overlay. */
  openAi: () => void;
}

export const AppContext = createContext<AppApi>({
  goTo: () => {},
  openQuickAdd: () => {},
  openEditor: () => {},
  openTransactions: () => {},
  openImport: () => {},
  openAi: () => {},
});

export const useApp = (): AppApi => useContext(AppContext);
