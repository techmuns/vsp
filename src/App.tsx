import { useEffect, useMemo, useState } from 'react';
import { AppContext, type AppApi, type QuickAddPrefill } from './app/context';
import type { Page } from './app/nav';
import { useDataset } from './db/hooks';
import { ensureSeeded } from './db/repo';
import { useSnapshot } from './app/useSnapshot';
import { resolveRange, startOfMonth, todayISO, type DateRange, type RangePreset } from './lib/dates';
import { Sidebar, MobileNav, TopBar, BootSplash } from './components/Shell';
import { DateRangePicker } from './components/DateRangePicker';
import { QuickAdd } from './components/quickadd/QuickAdd';
import { Onboarding } from './components/Onboarding';
import Overview from './pages/Overview';
import Settings from './pages/Settings';
import { StubPage } from './pages/StubPage';

export default function App() {
  const dataset = useDataset();
  const [page, setPage] = useState<Page>('overview');
  const [preset, setPreset] = useState<RangePreset>('this_month');
  const [custom, setCustom] = useState<DateRange>(() => ({ from: startOfMonth(todayISO()), to: todayISO() }));
  const [qa, setQa] = useState<{ open: boolean; prefill?: QuickAddPrefill }>({ open: false });
  const [onboard, setOnboard] = useState(false);

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
  const snapshot = useSnapshot(dataset, range);

  const api: AppApi = useMemo(
    () => ({ goTo: setPage, openQuickAdd: (prefill) => setQa({ open: true, prefill }) }),
    []
  );

  if (!dataset) return <BootSplash />;

  return (
    <AppContext.Provider value={api}>
      <div className="min-h-screen bg-canvas">
        <Sidebar page={page} onNavigate={setPage} />
        <div className="md:pl-60">
          <TopBar onQuickAdd={() => setQa({ open: true })}>
            <DateRangePicker preset={preset} range={range} custom={custom} onPreset={setPreset} onCustom={setCustom} />
          </TopBar>
          <MobileNav page={page} onNavigate={setPage} />
          <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">
            {page === 'overview' && snapshot && <Overview dataset={dataset} snapshot={snapshot} range={range} />}
            {page === 'settings' && <Settings dataset={dataset} />}
            {page !== 'overview' && page !== 'settings' && <StubPage page={page} dataset={dataset} snapshot={snapshot} />}
          </main>
        </div>

        <QuickAdd open={qa.open} prefill={qa.prefill} dataset={dataset} onClose={() => setQa({ open: false })} />
        {onboard && <Onboarding onClose={() => setOnboard(false)} />}
      </div>
    </AppContext.Provider>
  );
}
