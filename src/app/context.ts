import { createContext, useContext } from 'react';
import type { Page } from './nav';

export interface QuickAddPrefill {
  type?: string;
  accountId?: string;
  personId?: string;
  categoryId?: string;
}

export interface AppApi {
  goTo: (page: Page) => void;
  openQuickAdd: (prefill?: QuickAddPrefill) => void;
}

export const AppContext = createContext<AppApi>({
  goTo: () => {},
  openQuickAdd: () => {},
});

export const useApp = (): AppApi => useContext(AppContext);
