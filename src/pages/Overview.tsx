import { useMemo, type ReactNode } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  HandCoins,
  Receipt,
  AlertTriangle,
  Tag,
  CreditCard,
  Plus,
  Sparkles,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { Snapshot } from '../engine';
import { getTxnType } from '../engine';
import type { DateRange } from '../lib/dates';
import { fmtAxis, fmtCompact, fmtINR, fmtPct, fmtDateFriendly, fmtRange } from '../lib/format';
import { MONEY, colorForId, withAlpha } from '../lib/brand';
import { buildLookups, accountIcon, accountColor } from '../app/lookups';
import { useApp } from '../app/context';
import { Card, CardHeader, PageHeader, EmptyState } from '../components/ui/Card';
import { Button } from '../components/ui/Controls';
import { Donut, type DonutDatum } from '../components/charts/Donut';
import { Columns } from '../components/charts/Columns';
import { LineArea } from '../components/charts/LineArea';
import { loadDemoData } from '../demo/generate';

export default function Overview({ dataset, snapshot, range }: { dataset: Dataset; snapshot: Snapshot; range: DateRange }) {
  const app = useApp();
  const look = useMemo(() => buildLookups(dataset), [dataset]);
  const isEmpty = dataset.accounts.length === 0 && dataset.transactions.length === 0;

  if (isEmpty) return <Welcome />;

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader title="Overview" subtitle={<>Your money at a glance · <span className="tnum">{fmtRange(range.from, range.to)}</span></>} />

      <HeroRow snapshot={snapshot} />
      <SummaryCards snapshot={snapshot} />
      <ActionChips snapshot={snapshot} onGo={app.goTo} />
      <AccountsCard snapshot={snapshot} />

      <div className="grid gap-4 lg:grid-cols-2">
        <InOutInvestChart snapshot={snapshot} />
        <SpendingDonut snapshot={snapshot} look={look} />
        <CashflowChart snapshot={snapshot} />
        <NetWorthChart snapshot={snapshot} />
        <AllocationDonut snapshot={snapshot} dataset={dataset} />
        <NeedsAttention snapshot={snapshot} onGo={app.goTo} />
      </div>

      <RecentTransactions dataset={dataset} look={look} />
    </div>
  );
}

/* ---------------------------------------------------------------- accounts */

const ACCT_LABEL: Record<string, string> = { bank: 'Bank', cash: 'Cash wallet', credit_card: 'Credit card', broker_cash: 'Broker (usable cash)' };

/** Current balance in each account — the usable cash sitting there right now.
 *  Broker balances are the cash in that broker (holdings are shown separately). */
function AccountsCard({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.balances.filter((b) => b.account.active);
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader icon={Wallet} title="Accounts" subtitle="What’s in each account right now — the cash you can use." accent={MONEY.net} />
      <div className="divide-y divide-line">
        {rows.map((b) => {
          const Icon = accountIcon(b.account.type);
          const color = accountColor(b.account.type);
          const neg = b.balancePaise < 0;
          return (
            <div key={b.account.id} className="flex items-center gap-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: withAlpha(color, 0.14), color }}><Icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{b.account.name}</div>
                <div className="text-[11px] text-grey">{ACCT_LABEL[b.account.type] ?? b.account.type}{b.account.institution ? ` · ${b.account.institution}` : ''}</div>
              </div>
              <div className="tnum shrink-0 font-bold text-ink" style={neg ? { color: MONEY.out } : undefined}>{fmtINR(b.balancePaise)}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- welcome */

function Welcome() {
  const app = useApp();
  return (
    <div className="animate-fade-up">
      <PageHeader title="Overview" subtitle="Private, on-device money tracking." />
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/5" />
        <div className="relative grid place-items-center py-10 text-center">
          <span className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-gradient shadow-sm">
            <Sparkles size={28} className="text-white" />
          </span>
          <h2 className="font-display text-[20px] font-extrabold text-ink">Let’s set up your money</h2>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-grey">
            Add your first transaction to see your balances, spending and net worth come to life — or load realistic demo data to explore first.
            Everything stays private, on this device.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button size="lg" icon={Plus} onClick={() => app.openQuickAdd()}>
              Add a transaction
            </Button>
            <Button size="lg" variant="outline" icon={Sparkles} onClick={() => loadDemoData()}>
              Load demo data
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-muted">You can remove demo data anytime from Settings.</p>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------- hero */

function HeroRow({ snapshot }: { snapshot: Snapshot }) {
  const series = snapshot.netWorthSeries;
  const delta = series.length >= 2 ? series[series.length - 1].valuePaise - series[0].valuePaise : 0;
  const up = delta >= 0;
  return (
    <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr]">
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-5 py-5 text-white shadow-pop sm:px-6">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-14 right-16 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-white/80">
            <Landmark size={14} /> Net worth · today
          </div>
          <div className="tnum mt-1 font-display text-[30px] font-extrabold leading-none sm:text-[36px]">{fmtCompact(snapshot.netWorthPaise)}</div>
          {series.length >= 2 && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold">
              {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {fmtINR(Math.abs(delta))} this period
            </div>
          )}
          <p className="mt-2 max-w-sm text-[11.5px] leading-snug text-white/80">
            Everything you own minus what you owe — assets, investments and dues, netted.
          </p>
        </div>
      </div>

      <Card className="flex flex-col justify-center">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-grey">
          <Wallet size={14} className="text-money-net" /> Available now
        </div>
        <div className="tnum mt-1 font-display text-[26px] font-extrabold leading-none text-ink">{fmtINR(snapshot.availablePaise)}</div>
        <p className="mt-1.5 text-[12px] leading-snug text-grey">Spendable cash across your bank &amp; cash accounts.</p>
        <div className="mt-3 border-t border-line pt-2.5 text-[11.5px] text-grey">
          <span className="font-semibold text-slate">{snapshot.balances.filter((b) => b.balancePaise !== 0).length}</span> active accounts tracked
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- summary cards */

function StatCard({ icon: Icon, label, value, sub, color }: { icon: LucideIcon; label: string; value: string; sub?: ReactNode; color: string }) {
  return (
    <Card pad={false} className="p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${color}18`, color }}>
          <Icon size={15} strokeWidth={2.3} />
        </span>
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-grey">{label}</span>
      </div>
      <div className="tnum mt-2 font-display text-[21px] font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-grey">{sub}</div>}
    </Card>
  );
}

function SummaryCards({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={TrendingUp} label="Money in" value={fmtINR(snapshot.incomePaise)} color={MONEY.in} sub="Income received this period" />
      <StatCard icon={TrendingDown} label="Money spent" value={fmtINR(snapshot.expensePaise)} color={MONEY.out} sub="Your real spending, net of reimbursables" />
      <StatCard icon={PiggyBank} label="Invested" value={fmtINR(snapshot.investedPaise)} color={MONEY.invest} sub="Put into investments" />
      <StatCard
        icon={Sparkles}
        label="Savings rate"
        value={snapshot.savingsRate == null ? '—' : fmtPct(snapshot.savingsRate)}
        color={MONEY.save}
        sub={snapshot.savingsRate == null ? 'Add income to see this' : <>{fmtINR(snapshot.savingsPaise)} kept</>}
      />
    </div>
  );
}

/* ----------------------------------------------------------- action chips */

function Chip({ label, value, color, icon: Icon, onClick }: { label: string; value: string; color: string; icon: LucideIcon; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-2xl border border-line bg-white px-3.5 py-2.5 text-left shadow-card transition hover:shadow-card-hover focus-ring"
    >
      <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${color}18`, color }}>
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-grey">{label}</span>
        <span className="tnum block font-display text-[15px] font-extrabold leading-tight" style={{ color }}>
          {value}
        </span>
      </span>
      <ArrowRight size={14} className="ml-1 text-muted transition group-hover:translate-x-0.5 group-hover:text-slate" />
    </button>
  );
}

function ActionChips({ snapshot, onGo }: { snapshot: Snapshot; onGo: (p: 'people' | 'reimbursements') => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Chip label="Owed to you" value={fmtINR(snapshot.totalReceivablePaise)} color={MONEY.receivable} icon={HandCoins} onClick={() => onGo('people')} />
      <Chip label="You owe" value={fmtINR(snapshot.totalPayablePaise)} color={MONEY.payable} icon={ArrowDownRight} onClick={() => onGo('people')} />
      <Chip label="Reimbursement pending" value={fmtINR(snapshot.reimb.outstandingPaise)} color={MONEY.reimb} icon={Receipt} onClick={() => onGo('reimbursements')} />
    </div>
  );
}

/* --------------------------------------------------------------- charts */

function ChartCard({ icon, title, subtitle, accent, children }: { icon: LucideIcon; title: string; subtitle?: string; accent: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} subtitle={subtitle} accent={accent} />
      {children}
    </Card>
  );
}

function InOutInvestChart({ snapshot }: { snapshot: Snapshot }) {
  const data = [
    { key: 'in', label: 'Money in', value: snapshot.incomePaise, color: MONEY.in },
    { key: 'out', label: 'Spent', value: snapshot.expensePaise, color: MONEY.out },
    { key: 'inv', label: 'Invested', value: snapshot.investedPaise, color: MONEY.invest },
  ];
  const hasData = data.some((d) => d.value > 0);
  return (
    <ChartCard icon={TrendingUp} title="In vs Spent vs Invested" subtitle="How the money moved this period" accent={MONEY.net}>
      {hasData ? (
        <Columns data={data} format={(n) => fmtINR(n)} yAxisFormat={(n) => fmtAxis(n)} height={220} />
      ) : (
        <EmptyState icon={TrendingUp} title="Nothing yet this period" hint="Add income or spending to see this." compact />
      )}
    </ChartCard>
  );
}

function SpendingDonut({ snapshot, look }: { snapshot: Snapshot; look: ReturnType<typeof buildLookups> }) {
  const entries = Object.entries(snapshot.expenseByCategory)
    .map(([cat, value]) => ({ cat, value }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  const top = entries.slice(0, 7);
  const rest = entries.slice(7).reduce((s, e) => s + e.value, 0);
  const data: DonutDatum[] = top.map((e) => ({
    key: e.cat || 'uncat',
    label: e.cat ? look.catName(e.cat) : 'Uncategorised',
    value: e.value,
    color: e.cat ? look.catColor(e.cat) : MONEY.transfer,
  }));
  if (rest > 0) data.push({ key: 'other', label: 'Other', value: rest, color: '#CBD5E1' });
  const total = snapshot.expensePaise;

  return (
    <ChartCard icon={TrendingDown} title="Where you spent" subtitle="By category, this period" accent={MONEY.out}>
      {data.length ? (
        <>
          <Donut data={data} format={(n) => fmtINR(n)} centerTitle="Total spent" centerValue={fmtCompact(total)} height={230} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {data.map((d) => (
              <span key={d.key} className="inline-flex items-center gap-1.5 text-[12px] text-slate">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                {d.label}
                <span className="tnum font-semibold text-ink">{fmtINR(d.value)}</span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <EmptyState icon={TrendingDown} title="No spending this period" hint="Spending will break down by category here." compact />
      )}
    </ChartCard>
  );
}

function CashflowChart({ snapshot }: { snapshot: Snapshot }) {
  const points = snapshot.cashflowSeries.map((p) => ({
    label: p.label,
    value: p.netPaise,
    tipRows: [
      { label: 'Money in', value: fmtINR(p.inPaise), color: MONEY.in },
      { label: 'Spent', value: fmtINR(p.outPaise), color: MONEY.out },
      { label: 'Net', value: fmtINR(p.netPaise) },
    ],
  }));
  const hasData = snapshot.cashflowSeries.some((p) => p.inPaise || p.outPaise);
  return (
    <ChartCard icon={TrendingUp} title="Cash-flow trend" subtitle="Money in minus spending, over time" accent={MONEY.net}>
      {hasData ? (
        <LineArea points={points} color={MONEY.net} format={(n) => fmtINR(n)} yAxisFormat={(n) => fmtAxis(n)} height={230} />
      ) : (
        <EmptyState icon={TrendingUp} title="No flow yet" hint="Your in-vs-out trend will show here." compact />
      )}
    </ChartCard>
  );
}

function NetWorthChart({ snapshot }: { snapshot: Snapshot }) {
  const points = snapshot.netWorthSeries.map((p) => ({ label: p.label, value: p.valuePaise, tipRows: [{ label: 'Net worth', value: fmtINR(p.valuePaise) }] }));
  const hasData = points.length >= 2 && points.some((p) => p.value !== 0);
  return (
    <ChartCard icon={Landmark} title="Net-worth movement" subtitle="Where you stand, over time" accent={MONEY.net}>
      {hasData ? (
        <LineArea points={points} color={MONEY.net} format={(n) => fmtINR(n)} yAxisFormat={(n) => fmtAxis(n)} height={230} />
      ) : (
        <EmptyState icon={Landmark} title="Not enough history yet" hint="Net worth over time appears as you add data." compact />
      )}
    </ChartCard>
  );
}

function AllocationDonut({ snapshot, dataset }: { snapshot: Snapshot; dataset: Dataset }) {
  const byPlatform: Record<string, number> = {};
  const platformOf = new Map(dataset.investments.map((i) => [i.id, i.platform]));
  for (const [invId, pos] of Object.entries(snapshot.portfolio.byInvestment)) {
    if (pos.valuePaise <= 0) continue;
    const plat = platformOf.get(invId) ?? 'Other';
    byPlatform[plat] = (byPlatform[plat] ?? 0) + pos.valuePaise;
  }
  const data: DonutDatum[] = Object.entries(byPlatform)
    .sort((a, b) => b[1] - a[1])
    .map(([plat, value]) => ({ key: plat, label: plat, value, color: colorForId(plat) }));
  const total = snapshot.portfolio.totalValuePaise;

  return (
    <ChartCard icon={PiggyBank} title="Portfolio allocation" subtitle="By platform" accent={MONEY.invest}>
      {data.length ? (
        <>
          <Donut data={data} format={(n) => fmtINR(n)} centerTitle="Portfolio" centerValue={fmtCompact(total)} height={230} />
          {snapshot.portfolio.anyMissingPrice && (
            <p className="mt-2 text-center text-[11px] italic text-grey">Some holdings show at cost — no price recorded yet.</p>
          )}
        </>
      ) : (
        <EmptyState icon={PiggyBank} title="No investments yet" hint="Add an investment to see your allocation." compact />
      )}
    </ChartCard>
  );
}

/* ----------------------------------------------------- needs attention */

function NeedsAttention({ snapshot, onGo }: { snapshot: Snapshot; onGo: (p: 'transactions' | 'reimbursements' | 'people') => void }) {
  const app = useApp();
  const items: { icon: LucideIcon; color: string; title: string; hint: string; onClick?: () => void }[] = [];

  if (snapshot.uncategorisedCount > 0)
    items.push({
      icon: Tag,
      color: MONEY.transfer,
      title: `${snapshot.uncategorisedCount} need a category`,
      hint: 'Categorise them for cleaner insights.',
      onClick: () => onGo('transactions'),
    });

  if (snapshot.reimb.outstandingPaise > 0)
    items.push({
      icon: Receipt,
      color: MONEY.reimb,
      title: `${fmtINR(snapshot.reimb.outstandingPaise)} reimbursement pending`,
      hint: 'Claimable but not yet received.',
      onClick: () => onGo('reimbursements'),
    });

  for (const b of snapshot.balances) {
    if (b.account.type === 'credit_card' && b.balancePaise < 0) {
      items.push({
        icon: CreditCard,
        color: MONEY.card,
        title: `${fmtINR(-b.balancePaise)} on ${b.account.name}`,
        hint: 'Outstanding card balance.',
      });
    }
  }

  if (snapshot.totalPayablePaise > 0)
    items.push({ icon: ArrowDownRight, color: MONEY.payable, title: `${fmtINR(snapshot.totalPayablePaise)} you owe`, hint: 'Settle up when you can.', onClick: () => onGo('people') });

  return (
    <ChartCard icon={AlertTriangle} title="Needs attention" subtitle="A few things to tidy up" accent={MONEY.receivable}>
      {items.length ? (
        <div className="space-y-2">
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <button
                key={i}
                onClick={it.onClick}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5 text-left transition hover:border-brand/30 hover:bg-canvas focus-ring"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${it.color}18`, color: it.color }}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{it.title}</span>
                  <span className="block text-[11.5px] text-grey">{it.hint}</span>
                </span>
                {it.onClick && <ArrowRight size={14} className="text-muted" />}
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="All clear"
          hint="Nothing needs your attention right now."
          action={<Button variant="soft" icon={Plus} onClick={() => app.openQuickAdd()}>Add a transaction</Button>}
          compact
        />
      )}
    </ChartCard>
  );
}

/* --------------------------------------------------- recent transactions */

function RecentTransactions({ dataset, look }: { dataset: Dataset; look: ReturnType<typeof buildLookups> }) {
  const app = useApp();
  const recent = useMemo(
    () =>
      dataset.transactions
        .filter((t) => !t.voided)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
        .slice(0, 8),
    [dataset.transactions]
  );

  return (
    <Card>
      <CardHeader icon={Receipt} title="Recent transactions" subtitle="Your latest activity" accent={MONEY.net} right={<Button variant="soft" size="sm" icon={Plus} onClick={() => app.openQuickAdd()}>Add</Button>} />
      {recent.length ? (
        <div className="divide-y divide-line">
          {recent.map((t) => {
            const def = getTxnType(t.type);
            const color = def?.color ?? MONEY.transfer;
            const dir = def?.direction ?? 'neutral';
            const sign = dir === 'in' ? '+' : dir === 'out' ? '−' : '';
            const amtColor = dir === 'in' ? MONEY.in : dir === 'out' ? MONEY.out : MONEY.transfer;
            return (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold" style={{ background: withAlpha(color, 0.14), color }}>
                  {(def?.label ?? '?').slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{t.description || def?.label || 'Transaction'}</div>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-grey">
                    <span>{fmtDateFriendly(t.date)}</span>
                    {t.categoryId && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-sm" style={{ background: look.catColor(t.categoryId) }} />
                          {look.catName(t.categoryId)}
                        </span>
                      </>
                    )}
                    {t.accountId && (
                      <>
                        <span>·</span>
                        <span className="truncate">{look.accName(t.accountId)}</span>
                      </>
                    )}
                    {t.demo && <span className="rounded bg-money-invest/10 px-1 text-[9.5px] font-bold uppercase text-money-invest">demo</span>}
                  </div>
                </div>
                <div className="tnum shrink-0 text-[13.5px] font-bold" style={{ color: amtColor }}>
                  {sign}
                  {fmtINR(t.amountPaise)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Receipt} title="No transactions yet" hint="Add your first one to get started." action={<Button icon={Plus} onClick={() => app.openQuickAdd()}>Quick add</Button>} />
      )}
    </Card>
  );
}
