import { Fragment, useMemo, useState } from 'react';
import { Wallet, TrendingDown, PieChart, Target, CalendarRange, Briefcase, ChevronRight, Plus, Trash2, ArrowRight } from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { Snapshot } from '../engine';
import { spendBreakdown, eventBreakdown, budgetProgress, budgetActual, getTxnType } from '../engine';
import type { Budget, BudgetScope } from '../db/types';
import { addMonths, endOfMonth, startOfMonth, inRange, type DateRange } from '../lib/dates';
import { buildLookups } from '../app/lookups';
import { useApp } from '../app/context';
import { MONEY } from '../lib/brand';
import { fmtINR, fmtCompact, fmtAxis, fmtPct, fmtDate, fmtMonth } from '../lib/format';
import { saveBudget, removeEntity } from '../db/repo';
import { toast } from '../app/toast';
import { askConfirm } from '../app/confirm';
import { Card, PageHeader, CardHeader, EmptyState } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { Button, AmountField, Dropdown, Field, type Option } from '../components/ui/Controls';
import { Donut, type DonutDatum } from '../components/charts/Donut';
import { Columns } from '../components/charts/Columns';
import { HBars, type HBarDatum } from '../components/charts/Bars';

type Tab = 'category' | 'trends' | 'purpose' | 'budgets' | 'events';

const EXPENSE_LIKE = new Set(['expense', 'cc_purchase', 'shared_expense', 'cc_fee']);

export default function Expenses({ dataset, snapshot, range }: { dataset: Dataset; snapshot: Snapshot; range: DateRange }) {
  const [tab, setTab] = useState<Tab>('category');
  const look = useMemo(() => buildLookups(dataset), [dataset]);
  const eInput = useMemo(() => ({ transactions: dataset.transactions, splits: dataset.splits, policies: dataset.policies }), [dataset]);
  const bd = useMemo(() => spendBreakdown(eInput, range), [eInput, range]);

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader icon={Wallet} title="Expenses" subtitle="Where your money goes." accent={MONEY.out} right={<div className="hidden sm:block"><span className="text-[11px] font-semibold uppercase tracking-wide text-grey">Spent this period</span><div className="tnum font-display text-[18px] font-extrabold text-money-out">{fmtINR(snapshot.expensePaise)}</div></div>} />
      <SubTabs
        tabs={[
          { key: 'category', label: 'By category', color: MONEY.out },
          { key: 'trends', label: 'Trends', color: MONEY.net },
          { key: 'purpose', label: 'Personal vs Office', color: MONEY.reimb },
          { key: 'budgets', label: 'Budgets', color: MONEY.save },
          { key: 'events', label: 'By event', color: MONEY.invest },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'category' && <ByCategory bd={bd} look={look} />}
      {tab === 'trends' && <Trends eInput={eInput} range={range} bd={bd} look={look} dataset={dataset} />}
      {tab === 'purpose' && <ByPurpose bd={bd} look={look} dataset={dataset} range={range} />}
      {tab === 'budgets' && <Budgets dataset={dataset} snapshot={snapshot} eInput={eInput} range={range} look={look} />}
      {tab === 'events' && <ByEvent eInput={eInput} range={range} dataset={dataset} />}
    </div>
  );
}

type BD = ReturnType<typeof spendBreakdown>;
type Look = ReturnType<typeof buildLookups>;

function ByCategory({ bd, look }: { bd: BD; look: Look }) {
  const app = useApp();
  const [exp, setExp] = useState<string | null>(null);
  const rows = Object.entries(bd.byCategory).filter(([, v]) => v.netPaise > 0).sort((a, b) => b[1].netPaise - a[1].netPaise);
  const total = bd.totalNetPaise;
  const donut: DonutDatum[] = rows.slice(0, 8).map(([cat, v]) => ({ key: cat || 'uncat', label: cat ? look.catName(cat) : 'Uncategorised', value: v.netPaise, color: cat ? look.catColor(cat) : MONEY.transfer }));
  const rest = rows.slice(8).reduce((s, [, v]) => s + v.netPaise, 0);
  if (rest > 0) donut.push({ key: 'other', label: 'Other', value: rest, color: '#CBD5E1' });

  if (rows.length === 0) return <Card><EmptyState icon={TrendingDown} title="No spending this period" hint="Spending will break down by category here." /></Card>;

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader icon={PieChart} title="Spend by category" accent={MONEY.out} />
        <Donut data={donut} format={fmtINR} centerTitle="Total spent" centerValue={fmtCompact(total)} height={240} />
      </Card>
      <Card pad={false}>
        <div className="overflow-hidden rounded-2xl">
          <table className="w-full text-[12.5px]">
            <thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-right">Spent</th><th className="px-3 py-2 text-right">Share</th><th className="px-3 py-2 text-right">Txns</th><th className="w-8" /></tr></thead>
            <tbody>
              {rows.map(([cat, v]) => {
                const subs = Object.entries(bd.subByCategory[cat] ?? {}).filter(([, n]) => n !== 0).sort((a, b) => b[1] - a[1]);
                const purposes = Object.entries(bd.purposeByCategory[cat] ?? {}).filter(([, n]) => n !== 0).sort((a, b) => b[1] - a[1]);
                const open = exp === cat;
                return (
                  <Fragment key={cat}>
                    <tr className="border-b border-line/70 hover:bg-canvas">
                      <td className="px-3 py-2">
                        <button onClick={() => setExp(open ? null : cat)} className="inline-flex items-center gap-1.5 font-semibold text-ink">
                          <ChevronRight size={13} className={`text-grey transition ${open ? 'rotate-90' : ''}`} />
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cat ? look.catColor(cat) : MONEY.transfer }} />
                          {cat ? look.catName(cat) : 'Uncategorised'}
                        </button>
                      </td>
                      <td className="tnum px-3 py-2 text-right font-bold text-ink">{fmtINR(v.netPaise)}</td>
                      <td className="tnum px-3 py-2 text-right text-grey">{fmtPct(total ? (v.netPaise / total) * 100 : 0)}</td>
                      <td className="tnum px-3 py-2 text-right text-grey">{v.count}</td>
                      <td className="px-2 py-2 text-right"><button onClick={() => app.openTransactions({ categoryIds: [cat] })} title="View in Transactions" className="text-brand hover:text-brand/70"><ArrowRight size={14} /></button></td>
                    </tr>
                    {open && (
                      <tr className="bg-canvas/40">
                        <td colSpan={5} className="px-3 py-2.5">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <DetailList title="By subcategory" items={subs.map(([id, n]) => ({ label: id ? look.catName(id) : 'Unspecified', value: n }))} />
                            <DetailList title="By purpose" items={purposes.map(([id, n]) => ({ label: id ? look.purposeName(id) : 'Unspecified', value: n }))} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: { label: string; value: number }[] }) {
  if (items.length === 0) return <div><div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-grey">{title}</div><div className="text-[11.5px] text-muted">—</div></div>;
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-grey">{title}</div>
      <div className="space-y-1">
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between text-[12px]"><span className="truncate text-slate">{it.label}</span><span className="tnum font-semibold text-ink">{fmtINR(it.value)}</span></div>
        ))}
      </div>
    </div>
  );
}

function Trends({ eInput, range, bd, look, dataset }: { eInput: { transactions: Dataset['transactions']; splits: Dataset['splits']; policies: Dataset['policies'] }; range: DateRange; bd: BD; look: Look; dataset: Dataset }) {
  const months = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const anchor = addMonths(range.to, -i);
      const mRange = { from: startOfMonth(anchor), to: endOfMonth(anchor) };
      const total = spendBreakdown(eInput, mRange).totalNetPaise;
      out.push({ label: fmtMonth(startOfMonth(anchor)), value: total });
    }
    return out;
  }, [eInput, range.to]);

  const topCats: HBarDatum[] = Object.entries(bd.byCategory).filter(([, v]) => v.netPaise > 0).sort((a, b) => b[1].netPaise - a[1].netPaise).slice(0, 7).map(([cat, v]) => ({ key: cat || 'u', label: cat ? look.catName(cat) : 'Uncategorised', value: v.netPaise, color: cat ? look.catColor(cat) : MONEY.transfer, valueLabel: fmtINR(v.netPaise) }));

  const biggest = dataset.transactions
    .filter((t) => !t.voided && ['expense', 'cc_purchase', 'shared_expense'].includes(t.type) && t.date >= range.from && t.date <= range.to)
    .sort((a, b) => b.amountPaise - a.amountPaise)
    .slice(0, 6);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader icon={CalendarRange} title="Spending by month" subtitle="Last 6 months" accent={MONEY.net} />
        <Columns data={months.map((m) => ({ key: m.label, label: m.label, value: m.value, color: MONEY.out }))} format={fmtINR} yAxisFormat={fmtAxis} height={220} />
      </Card>
      <Card>
        <CardHeader icon={TrendingDown} title="Top categories" subtitle="This period" accent={MONEY.out} />
        {topCats.length ? <HBars data={topCats} format={fmtINR} barSize={24} labelWidth={120} /> : <EmptyState icon={TrendingDown} title="No spend yet" compact />}
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader icon={Target} title="Biggest single expenses" subtitle="This period" accent={MONEY.out} />
        {biggest.length ? (
          <div className="divide-y divide-line">
            {biggest.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.categoryId ? look.catColor(t.categoryId) : MONEY.transfer }} />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{t.description || getTxnType(t.type)?.label}</span>
                <span className="text-[11.5px] text-grey">{fmtDate(t.date)}</span>
                <span className="tnum w-24 text-right font-bold text-money-out">{fmtINR(t.amountPaise)}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={Target} title="No expenses yet" compact />}
      </Card>
    </div>
  );
}

function ByPurpose({ bd, look, dataset, range }: { bd: BD; look: Look; dataset: Dataset; range: DateRange }) {
  const app = useApp();
  const [exp, setExp] = useState<string | null>(null);
  const rows = Object.entries(bd.byPurpose).filter(([, v]) => v.grossPaise > 0).sort((a, b) => b[1].grossPaise - a[1].grossPaise);
  const totalGross = rows.reduce((s, [, v]) => s + v.grossPaise, 0);
  const totalClaim = rows.reduce((s, [, v]) => s + v.claimablePaise, 0);
  const totalNet = rows.reduce((s, [, v]) => s + v.netPaise, 0);
  if (rows.length === 0) return <Card><EmptyState icon={Briefcase} title="No tagged spend yet" hint="Tag expenses with a purpose (Office / Personal) to see this split." /></Card>;
  const txnsFor = (pid: string) =>
    dataset.transactions
      .filter((t) => !t.voided && EXPENSE_LIKE.has(t.type) && (t.purposeId ?? '') === pid && inRange(t.date, range.from, range.to))
      .sort((a, b) => b.amountPaise - a.amountPaise);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card pad={false} className="px-3.5 py-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-grey">Gross spent</div><div className="tnum mt-0.5 font-display text-[18px] font-extrabold text-ink">{fmtINR(totalGross)}</div></Card>
        <Card pad={false} className="px-3.5 py-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-grey">Recoverable</div><div className="tnum mt-0.5 font-display text-[18px] font-extrabold text-money-reimb">{fmtINR(totalClaim)}</div></Card>
        <Card pad={false} className="px-3.5 py-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-grey">Net personal</div><div className="tnum mt-0.5 font-display text-[18px] font-extrabold text-money-out">{fmtINR(totalNet)}</div></Card>
      </div>
      <Card pad={false}>
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Purpose</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Claimable back</th><th className="px-3 py-2 text-right">Net personal cost</th><th className="w-8" /></tr></thead>
          <tbody>
            {rows.map(([pid, v]) => {
              const open = exp === pid;
              const txns = open ? txnsFor(pid) : [];
              return (
                <Fragment key={pid}>
                  <tr className="border-b border-line/70 last:border-0 hover:bg-canvas">
                    <td className="px-3 py-2">
                      <button onClick={() => setExp(open ? null : pid)} className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        <ChevronRight size={13} className={`text-grey transition ${open ? 'rotate-90' : ''}`} />
                        {pid ? look.purposeName(pid) : 'Unspecified'}
                      </button>
                    </td>
                    <td className="tnum px-3 py-2 text-right text-slate">{fmtINR(v.grossPaise)}</td>
                    <td className="tnum px-3 py-2 text-right text-money-reimb">{v.claimablePaise > 0 ? fmtINR(v.claimablePaise) : '—'}</td>
                    <td className="tnum px-3 py-2 text-right font-bold text-money-out">{fmtINR(v.netPaise)}</td>
                    <td className="px-2 py-2 text-right">{pid && <button onClick={() => app.openTransactions({ purposeIds: [pid] })} title="Open in Transactions" className="text-brand hover:text-brand/70"><ArrowRight size={14} /></button>}</td>
                  </tr>
                  {open && (
                    <tr className="bg-canvas/40">
                      <td colSpan={5} className="px-3 py-2.5">
                        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-grey">{pid ? look.purposeName(pid) : 'Unspecified'} transactions · highest first</div>
                        {txns.length === 0 ? (
                          <div className="text-[11.5px] text-muted">No individual transactions in this period.</div>
                        ) : (
                          <div className="divide-y divide-line/70">
                            {txns.map((t) => (
                              <button key={t.id} onClick={() => app.openEditor({ txnId: t.id })} className="flex w-full items-center gap-3 py-1.5 text-left hover:opacity-80">
                                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: t.categoryId ? look.catColor(t.categoryId) : MONEY.transfer }} />
                                <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.description || getTxnType(t.type)?.label}</span>
                                <span className="hidden shrink-0 text-[11px] text-grey sm:inline">{t.categoryId ? look.catName(t.categoryId) : ''}</span>
                                <span className="shrink-0 text-[11px] text-grey">{fmtDate(t.date)}</span>
                                <span className="tnum w-24 shrink-0 text-right font-bold text-money-out">{fmtINR(t.amountPaise)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="px-1 text-[11.5px] text-grey">Net personal cost is what you actually bear — gross spend minus what’s claimable back under your reimbursement policies. Tap any purpose to see its transactions, highest spend first.</p>
    </div>
  );
}

function Budgets({ dataset, snapshot, eInput, range, look }: { dataset: Dataset; snapshot: Snapshot; eInput: { transactions: Dataset['transactions']; splits: Dataset['splits']; policies: Dataset['policies'] }; range: DateRange; look: Look }) {
  const [adding, setAdding] = useState(false);
  const events = useMemo(() => eventBreakdown(eInput, range), [eInput, range]);
  const byEventNet: Record<string, number> = {};
  for (const [id, t] of Object.entries(events)) byEventNet[id] = t.netPersonalPaise;
  const figures = { overallPaise: snapshot.expensePaise, byCategory: snapshot.expenseByCategory, byEvent: byEventNet };

  const budgets = dataset.budgets.filter((b) => b.active);
  const label = (b: Budget) => (b.scope === 'overall' ? 'Overall spending' : b.scope === 'category' ? look.catName(b.refId) : dataset.events.find((e) => e.id === b.refId)?.name ?? 'Event');

  return (
    <Card>
      <CardHeader icon={Target} title="Budgets" subtitle="Optional caps with a simple traffic light. Never required." accent={MONEY.save} right={<Button size="sm" icon={Plus} onClick={() => setAdding((a) => !a)}>Add budget</Button>} />
      {adding && <BudgetForm dataset={dataset} onDone={() => setAdding(false)} />}
      {budgets.length === 0 && !adding ? (
        <EmptyState icon={Target} title="No budgets yet" hint="Set a monthly cap for overall spend, a category or an event — and track it at a glance." compact />
      ) : (
        <div className="mt-3 space-y-3">
          {budgets.map((b) => {
            const actual = budgetActual(b, figures);
            const p = budgetProgress(b.amountPaise, actual);
            const color = p.state === 'over' ? MONEY.out : p.state === 'warn' ? MONEY.receivable : MONEY.save;
            return (
              <div key={b.id} className="rounded-xl border border-line p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="font-semibold text-ink">{label(b)} <span className="text-[11px] font-normal text-grey">· {b.period}</span></div>
                  <div className="flex items-center gap-2">
                    <span className="tnum text-[12.5px] font-bold" style={{ color }}>{fmtINR(actual)} <span className="font-normal text-grey">/ {fmtINR(b.amountPaise)}</span></span>
                    <button onClick={async () => { if (await askConfirm({ title: 'Delete this budget?', danger: true, confirmLabel: 'Delete' })) { await removeEntity('budgets', b.id); toast('Budget deleted', { tone: 'error' }); } }} className="text-muted hover:text-money-out"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, p.pct)}%`, background: color }} />
                </div>
                <div className="mt-1 text-[11.5px]" style={{ color }}>{p.state === 'over' ? `Over by ${fmtINR(p.overPaise)}` : `${fmtINR(p.remainingPaise)} left · ${isFinite(p.pct) ? p.pct.toFixed(0) : '∞'}% used`}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function BudgetForm({ dataset, onDone }: { dataset: Dataset; onDone: () => void }) {
  const [scope, setScope] = useState<BudgetScope>('overall');
  const [refId, setRefId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const catOpts: Option[] = dataset.categories.filter((c) => c.active && c.kind !== 'income').map((c) => ({ value: c.id, label: c.name }));
  const eventOpts: Option[] = dataset.events.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name }));
  const canSave = !!amount && amount > 0 && (scope === 'overall' || !!refId);
  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.04] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Budget for"><Dropdown value={scope} options={[{ value: 'overall', label: 'Overall spending' }, { value: 'category', label: 'A category' }, { value: 'event', label: 'An event' }]} onChange={(v) => { setScope(v as BudgetScope); setRefId(''); }} width="100%" /></Field>
        {scope === 'category' && <Field label="Category"><Dropdown value={refId} options={catOpts} onChange={setRefId} placeholder="Pick" width="100%" /></Field>}
        {scope === 'event' && <Field label="Event"><Dropdown value={refId} options={eventOpts} onChange={setRefId} placeholder="Pick" width="100%" /></Field>}
        <Field label="Amount"><AmountField paise={amount} onPaise={setAmount} /></Field>
        <Field label="Period label" hint="e.g. 2026-10 or ‘monthly’"><input value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-[13.5px] outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15" /></Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={!canSave} onClick={async () => { await saveBudget({ scope, refId: refId || undefined, amountPaise: amount!, period }); toast('Budget added', { tone: 'success' }); onDone(); }}>Save budget</Button>
      </div>
    </div>
  );
}

function ByEvent({ eInput, range, dataset }: { eInput: { transactions: Dataset['transactions']; splits: Dataset['splits']; policies: Dataset['policies'] }; range: DateRange; dataset: Dataset }) {
  const events = useMemo(() => eventBreakdown(eInput, range), [eInput, range]);
  const rows = Object.entries(events).sort((a, b) => b[1].paidPaise - a[1].paidPaise);
  if (rows.length === 0) return <Card><EmptyState icon={CalendarRange} title="No events yet" hint="Tag transactions with an event (a trip, a party) to see their totals here." /></Card>;
  return (
    <Card pad={false}>
      <div className="nice-scroll overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Event</th><th className="px-3 py-2 text-right">Total paid</th><th className="px-3 py-2 text-right">Your gross</th><th className="px-3 py-2 text-right">Recoverable</th><th className="px-3 py-2 text-right">Reimbursable</th><th className="px-3 py-2 text-right">Net personal</th></tr></thead>
          <tbody>
            {rows.map(([id, t]) => (
              <tr key={id} className="border-b border-line/70 last:border-0">
                <td className="px-3 py-2 font-semibold text-ink">{dataset.events.find((e) => e.id === id)?.name ?? 'Event'} <span className="text-[11px] font-normal text-grey">· {t.count}</span></td>
                <td className="tnum px-3 py-2 text-right text-slate">{fmtINR(t.paidPaise)}</td>
                <td className="tnum px-3 py-2 text-right text-grey">{fmtINR(t.grossPaise)}</td>
                <td className="tnum px-3 py-2 text-right text-money-receivable">{t.recoverablePaise > 0 ? fmtINR(t.recoverablePaise) : '—'}</td>
                <td className="tnum px-3 py-2 text-right text-money-reimb">{t.reimbursablePaise > 0 ? fmtINR(t.reimbursablePaise) : '—'}</td>
                <td className="tnum px-3 py-2 text-right font-bold text-money-out">{fmtINR(t.netPersonalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
