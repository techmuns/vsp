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
import { Onboarding } from './components/Onboarding';
import Overview from './pages/Overview';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';
import Expenses from './pages/Expenses';
import People from './pages/People';
import Reimbursements from './pages/Reimbursements';
import Investments from './pages/Investments';
import Reports from './pages/Reports';

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
  const snapshot = useMemo(
    () => (dataset ? computeSnapshot({ ...datasetToEngineInput(dataset), prices }, range) : null),
    [dataset, prices, range]
  );

  // In-dashboard notifications — built from live data, filtered by dismissals.
  const notifications = useMemo(() => {
    if (!dataset || !snapshot) return [];
    const all = buildNotifications({
      settings: dataset.settings,
      recurring: dataset.recurring,
      accounts: dataset.accounts,
      people: dataset.people,
      transactions: dataset.transactions,
      splits: dataset.splits,
      policies: dataset.policies,
      snapshot,
      today: todayISO(),
    });
    const dismissed = new Set(dataset.settings?.dismissedNotifications ?? []);
    return all.filter((n) => !dismissed.has(n.id));
  }, [dataset, snapshot]);

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

  return (
    <AppContext.Provider value={api}>
      <div className="min-h-screen bg-canvas">
        <Sidebar page={page} onNavigate={setPage} />
        <div className="md:pl-60">
          <TopBar
            onQuickAdd={() => setQa({ open: true })}
            notifications={<NotificationBell items={notifications} onNavigate={setPage} onDismiss={dismissNotification} />}
          >
            <DateRangePicker preset={preset} range={range} custom={custom} onPreset={setPreset} onCustom={setCustom} />
          </TopBar>
          <MobileNav page={page} onNavigate={setPage} />
          <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">
            {page === 'overview' && snapshot && <Overview dataset={dataset} snapshot={snapshot} range={range} />}
            {page === 'transactions' && snapshot && <Transactions dataset={dataset} snapshot={snapshot} range={range} />}
            {page === 'expenses' && snapshot && <Expenses dataset={dataset} snapshot={snapshot} range={range} />}
            {page === 'people' && snapshot && <People dataset={dataset} snapshot={snapshot} range={range} />}
            {page === 'reimbursements' && snapshot && <Reimbursements dataset={dataset} snapshot={snapshot} range={range} />}
            {page === 'investments' && snapshot && <Investments dataset={dataset} snapshot={snapshot} range={range} prices={prices} market={market} />}
            {page === 'reports' && snapshot && <Reports dataset={dataset} snapshot={snapshot} range={range} prices={prices} />}
            {page === 'settings' && <Settings dataset={dataset} snapshot={snapshot} />}
          </main>
        </div>

        <QuickAdd open={qa.open} prefill={qa.prefill} dataset={dataset} onClose={() => setQa({ open: false })} />
        <TxnEditor open={editor.open} arg={editor.arg} dataset={dataset} onClose={() => setEditor({ open: false, arg: {} })} />
        <StatementImport open={importOpen} dataset={dataset} onClose={() => setImportOpen(false)} />
        <AiCategorize open={aiOpen} dataset={dataset} onClose={() => setAiOpen(false)} />
        {onboard && <Onboarding onClose={() => setOnboard(false)} />}
        <ToastHost />
      </div>
    </AppContext.Provider>
  );
}
