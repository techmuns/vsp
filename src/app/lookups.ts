import { Landmark, Wallet, CreditCard, LineChart, Circle, type LucideIcon } from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { Account, AccountType, Purpose } from '../db/types';
import { colorForId, MONEY } from '../lib/brand';

/** A purpose counts as "Office" (work spend) when its name reads office — the
 *  same name test the Reimbursements page uses to tally official spend. Used
 *  to default "Claim this back" on for office expenses. */
export function isOfficePurpose(purposes: Pick<Purpose, 'id' | 'name'>[], purposeId?: string): boolean {
  if (!purposeId) return false;
  const p = purposes.find((x) => x.id === purposeId);
  return !!p && /office/i.test(p.name);
}

export interface Lookups {
  accountById: Map<string, Account>;
  accName: (id?: string) => string;
  catName: (id?: string) => string;
  catColor: (id?: string) => string;
  personName: (id?: string) => string;
  purposeName: (id?: string) => string;
  investmentName: (id?: string) => string;
}

export function buildLookups(d: Dataset): Lookups {
  const accountById = new Map(d.accounts.map((a) => [a.id, a]));
  const catById = new Map(d.categories.map((c) => [c.id, c]));
  const personById = new Map(d.people.map((p) => [p.id, p]));
  const purposeById = new Map(d.purposes.map((p) => [p.id, p]));
  const invById = new Map(d.investments.map((i) => [i.id, i]));

  return {
    accountById,
    accName: (id) => (id ? accountById.get(id)?.name ?? '—' : '—'),
    catName: (id) => (id ? catById.get(id)?.name ?? 'Uncategorised' : 'Uncategorised'),
    catColor: (id) => {
      if (!id) return MONEY.transfer;
      const c = catById.get(id);
      return c?.colorKey ?? colorForId(id);
    },
    personName: (id) => (id ? personById.get(id)?.name ?? '—' : '—'),
    purposeName: (id) => (id ? purposeById.get(id)?.name ?? '' : ''),
    investmentName: (id) => (id ? invById.get(id)?.name ?? '—' : '—'),
  };
}

const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  bank: Landmark,
  cash: Wallet,
  credit_card: CreditCard,
  broker_cash: LineChart,
  other: Circle,
};

export function accountIcon(type: AccountType): LucideIcon {
  return ACCOUNT_ICONS[type] ?? Circle;
}

export function accountColor(type: AccountType): string {
  if (type === 'credit_card') return MONEY.card;
  if (type === 'broker_cash') return MONEY.invest;
  if (type === 'cash') return MONEY.save;
  return MONEY.net;
}
