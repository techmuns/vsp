import { useEffect, useMemo, useState } from 'react';
import { AppContext, type AppApi, type EditorArg, type QuickAddPrefill } from './app/context';
import type { Page } from './app/nav';
import { useDataset } from './db/hooks';
import { ensureSeeded, updateSettings } from './db/repo';
import { datasetToEngineInput } from './app/useSnapshot';
import { computeSnapshot, buildNotifications } from './engine';
import { NotificationBell } from './components/NotificationBell';
import { useMarketPrices, mergePrices } from './app/market';
import { setPendingTxnFilter } from './app/pendingFilter';
import { resolveRange, startOfMonth, todayISO, type DateRange, type RangePreset } from './lib/dates';
import { Sidebar, MobileNav, TopBar, BootSplash } from './components/Shell';
import { DateRangePicker } from './components/DateRangePicker';
import { QuickAdd } from './components/quickadd/QuickAdd';
import { TxnEditor } from './components/editor/TxnEditor';
import { StatementImport } from './components/import/StatementImport';
import { AiCategorize } from './components/ai/AiCategorize';
import { ToastHost } from './app/toast';
import { ConfirmHost } from './app/confirm';
import { Onboarding } from './components/Onboarding';
import Overview from './pages/Overview';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';
import Expenses from './pages/Expenses';
import People from './pages/People';
import Reimbursements from './pages/Reimbursements';
import Investments from './pages/Investments';
import Reports from './pages/Reports';
import { Wallet } from 'lucide-react';
import { Dropdown } from './components/ui/Controls';
import type { Account } from './db/types';

/** Global account filter shown in the top bar. */
function AccountFilter({ accounts, value, onChange }: { accounts: Account[]; value: string; onChange: (v: string) => void }) {
  const opts = [{ value: 'all', label: 'All accounts' }, ...accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))];
  return (
    <div className="flex items-center gap-1.5">
      <Wallet size={15} className="hidden shrink-0 text-grey sm:block" />
      <Dropdown value={value} options={opts} onChange={onChange} size="sm" width={148} />
    </div>
  );
}

export default function App() {
  const dataset = useDataset();
  const [page, setPage] = useState<Page>('overview');
  const [preset, setPreset] = useState<RangePreset>('this_month');
  const [custom, setCustom] = useState<DateRange>(() => ({ from: startOfMonth(todayISO()), to: todayISO() }));
  const [qa, setQa] = useState<{ open: boolean; prefill?: QuickAddPrefill }>({ open: false });
  const [editor, setEditor] = useState<{ open: boolean; arg: EditorArg }>({ open: false, arg: {} });
  const [importOpen, setImportOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [onboard, setOnboard] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const market = useMarketPrices();

  useEffect(() => {
    ensureSeeded();
  }, []);

  // First-run onboarding: settings exist, never onboarded, and nothing entered yet.
  useEffect(() => {
    if (dataset?.settings && !dataset.settings.onboardedAt && dataset.accounts.length === 0 && dataset.transactions.length === 0) {
      setOnboard(true);
    }
  }, [dataset?.settings, dataset?.accounts.length, dataset?.transactions.length]);

  const salaryDay = dataset?.settings?.salaryCycleStartDay ?? 11;
  const earliest = useMemo(() => {
    if (!dataset) return undefined;
    const dates = [...dataset.transactions.map((t) => t.date), ...dataset.accounts.map((a) => a.openingDate)].filter(Boolean).sort();
    return dates[0];
  }, [dataset]);

  const range = useMemo(() => resolveRange(preset, { salaryDay, custom, earliest }), [preset, salaryDay, custom, earliest]);

  // Merge manual DB prices with the optional public market feed, newest wins.
  const prices = useMemo(() => (dataset ? mergePrices(dataset.prices, dataset.investments, market.rows) : []), [dataset, market.rows]);

  // Global account filter: when a specific account is picked, every view is
  // scoped to the transactions touching it (both legs of a transfer) and to
  // that account alone. 'all' is the full, unfiltered dashboard.
  const scoped = useMemo(() => {
    if (!dataset || accountFilter === 'all') return dataset;
    return {
      ...dataset,
      transactions: dataset.transactions.filter((t) => t.accountId === accountFilter || t.counterAccountId === accountFilter),
      accounts: dataset.accounts.filter((a) => a.id === accountFilter),
    };
  }, [dataset, accountFilter]);

  const snapshot = useMemo(
    () => (scoped ? computeSnapshot({ ...datasetToEngineInput(scoped), prices }, range) : null),
    [scoped, prices, range]
  );
  // Notifications are account-independent (bills due, limits), so build them
  // from the full dataset even when a single account is selected.
  const fullSnapshot = useMemo(
    () => (accountFilter === 'all' ? snapshot : dataset ? computeSnapshot({ ...datasetToEngineInput(dataset), prices }, range) : null),
    [accountFilter, snapshot, dataset, prices, range]
  );

  // In-dashboard notifications — built from live data, filtered by dismissals.
  const notifications = useMemo(() => {
    if (!dataset || !fullSnapshot) return [];
    const all = buildNotifications({
      settings: dataset.settings,
      recurring: dataset.recurring,
      accounts: dataset.accounts,
      people: dataset.people,
      transactions: dataset.transactions,
      splits: dataset.splits,
      policies: dataset.policies,
      snapshot: fullSnapshot,
      today: todayISO(),
    });
    const dismissed = new Set(dataset.settings?.dismissedNotifications ?? []);
    return all.filter((n) => !dismissed.has(n.id));
  }, [dataset, fullSnapshot]);

  const dismissNotification = (id: string) => {
    const cur = dataset?.settings?.dismissedNotifications ?? [];
    void updateSettings({ dismissedNotifications: [...new Set([...cur, id])] });
  };

  const api: AppApi = useMemo(
    () => ({
      goTo: setPage,
      openQuickAdd: (prefill) => setQa({ open: true, prefill }),
      openEditor: (arg) => setEditor({ open: true, arg: arg ?? {} }),
      openTransactions: (filter) => {
        setPendingTxnFilter(filter ?? null);
        setPage('transactions');
      },
      openImport: () => setImportOpen(true),
      openAi: () => setAiOpen(true),
    }),
    []
  );

  if (!dataset) return <BootSplash />;

  // The account-scoped view handed to the pages (equals `dataset` when 'all').
  const view = scoped ?? dataset;

  return (
    <AppContext.Provider value={api}>
      <div className="min-h-screen bg-canvas">
        <Sidebar page={page} onNavigate={setPage} />
        <div className="md:pl-60">
          <TopBar
            onQuickAdd={() => setQa({ open: true })}
            notifications={<NotificationBell items={notifications} onNavigate={setPage} onDismiss={dismissNotification} />}
            leftExtra={dataset.accounts.length > 0 && page !== 'settings' ? <AccountFilter accounts={dataset.accounts} value={accountFilter} onChange={setAccountFilter} /> : undefined}
          >
            <DateRangePicker preset={preset} range={range} custom={custom} onPreset={setPreset} onCustom={setCustom} />
          </TopBar>
          <MobileNav page={page} onNavigate={setPage} />
          <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">
            {page === 'overview' && snapshot && <Overview dataset={view} snapshot={snapshot} range={range} />}
            {page === 'transactions' && snapshot && <Transactions dataset={view} snapshot={snapshot} range={range} />}
            {page === 'expenses' && snapshot && <Expenses dataset={view} snapshot={snapshot} range={range} />}
            {page === 'people' && snapshot && <People dataset={view} snapshot={snapshot} range={range} />}
            {page === 'reimbursements' && snapshot && <Reimbursements dataset={view} snapshot={snapshot} range={range} />}
            {page === 'investments' && snapshot && <Investments dataset={view} snapshot={snapshot} range={range} prices={prices} market={market} />}
            {page === 'reports' && snapshot && <Reports dataset={view} snapshot={snapshot} range={range} prices={prices} />}
            {page === 'settings' && <Settings dataset={dataset} snapshot={fullSnapshot} />}
          </main>
        </div>

        <QuickAdd open={qa.open} prefill={qa.prefill} dataset={dataset} onClose={() => setQa({ open: false })} />
        <TxnEditor open={editor.open} arg={editor.arg} dataset={dataset} onClose={() => setEditor({ open: false, arg: {} })} />
        <StatementImport open={importOpen} dataset={dataset} onClose={() => setImportOpen(false)} />
        <AiCategorize open={aiOpen} dataset={dataset} onClose={() => setAiOpen(false)} />
        {onboard && <Onboarding onClose={() => setOnboard(false)} />}
        <ToastHost />
        <ConfirmHost />
      </div>
    </AppContext.Provider>
  );
}
