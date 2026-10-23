import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  Users,
  Receipt,
  PieChart,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { MONEY } from '../lib/brand';

export type Page =
  | 'overview'
  | 'transactions'
  | 'expenses'
  | 'investments'
  | 'people'
  | 'reimbursements'
  | 'reports'
  | 'settings';

export interface NavItem {
  key: Page;
  label: string;
  icon: LucideIcon;
  color: string;
  /** Live in Phase 1, vs a tidy "coming next" stub. */
  live?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, color: MONEY.net, live: true },
  { key: 'transactions', label: 'Transactions', icon: ArrowLeftRight, color: MONEY.transfer },
  { key: 'expenses', label: 'Expenses', icon: Wallet, color: MONEY.out },
  { key: 'investments', label: 'Investments', icon: TrendingUp, color: MONEY.invest },
  { key: 'people', label: 'People', icon: Users, color: MONEY.receivable },
  { key: 'reimbursements', label: 'Reimbursements', icon: Receipt, color: MONEY.reimb },
  { key: 'reports', label: 'Reports', icon: PieChart, color: MONEY.net },
];

export const SETTINGS_NAV: NavItem = { key: 'settings', label: 'Settings', icon: Settings, color: MONEY.transfer, live: true };
