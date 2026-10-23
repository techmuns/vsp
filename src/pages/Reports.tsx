import { useMemo, useState } from 'react';
import { PieChart, TrendingUp, Landmark, Receipt, Users, Sparkles, Trophy, FileDown, Printer, Lightbulb } from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { Price } from '../db/types';
import {
  computeSnapshot,
  spendBreakdown,
  periodInsights,
  buildClaimableLines,
  personPositions,
  type Snapshot,
  type Filters,
} from '../engine';
import { datasetToEngineInput } from '../app/useSnapshot';
import { addDays, spanDays, startOfYear, type DateRange } from '../lib/dates';
import { buildLookups } from '../app/lookups';
import { MONEY } from '../lib/brand';
import { fmtINR, fmtCompact, fmtAxis, fmtPct, fmtRange, fmtDate } from '../lib/format';
import { exportReportCsv, exportReportXlsx, printDocument, esc, type Row } from '../lib/exporters';
import { toast } from '../app/toast';
import { Card, PageHeader, CardHeader, EmptyState, MiniStat } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { Button, MultiSelect, Dropdown, type Option } from '../components/ui/Controls';
import { Donut, type DonutDatum } from '../components/charts/Donut';
import { Columns } from '../components/charts/Columns';
import { LineArea } from '../components/charts/LineArea';
import { HBars, type HBarDatum } from '../components/charts/Bars';

type Report = 'money' | 'categories' | 'investments' | 'networth' | 'reimbursements' | 'people' | 'reconcile' | 'year';

export default function Reports({ dataset, range, prices }: { dataset: Dataset; snapshot: Snapshot; range: DateRange; prices: Price[] }) {
  const [report, setReport] = useState<Report>('money');
  const [filters, setFilters] = useState<Filters>({});
  const look = useMemo(() => buildLookups(dataset), [dataset]);
  const eInput = useMemo(() => ({ ...datasetToEngineInput(dataset), prices }), [dataset, prices]);

  const snap = useMemo(() => computeSnapshot(eInput, range, filters), [eInput, range, filters]);
  const prevRange = useMemo<DateRange>(() => {
    const span = spanDays(range.from, range.to);
    return { from: addDays(range.from, -span), to: addDays(range.from, -1) };
  }, [range]);
  const prevSnap = useMemo(() => computeSnapshot(eInput, prevRange, filters), [eInput, prevRange, filters]);

  const meta = useMemo<Row[]>(() => {
    const parts: string[] = [];
    if (filters.accountIds?.length) parts.push(`Accounts: ${filters.accountIds.map(look.accName).join(', ')}`);
    if (filters.categoryIds?.length) parts.push(`Categories: ${filters.categoryIds.map(look.catName).join(', ')}`);
    if (filters.personIds?.length) parts.push(`People: ${filters.personIds.map(look.personName).join(', ')}`);
    if (filters.purposeIds?.length) parts.push(`Purposes: ${filters.purposeIds.map(look.purposeName).join(', ')}`);
    if (filters.eventId) parts.push(`Event: ${dataset.events.find((e) => e.id === filters.eventId)?.name ?? ''}`);
    return [
      { Field: 'App', Value: 'Kosh' },
      { Field: 'Date range', Value: fmtRange(range.from, range.to) },
      { Field: 'Filters', Value: parts.length ? parts.join(' · ') : 'None' },
      { Field: 'Generated', Value: fmtDate(new Date()) },
    ];
  }, [filters, range, look, dataset.events]);

  const accountOpts: Option[] = dataset.accounts.map((a) => ({ value: a.id, label: a.name }));
  const catOpts: Option[] = dataset.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name, color: look.catColor(c.id) }));
  const personOpts: Option[] = dataset.people.map((p) => ({ value: p.id, label: p.name }));
  const purposeOpts: Option[] = dataset.purposes.map((p) => ({ value: p.id, label: p.name }));
  const eventOpts: Option[] = dataset.events.map((e) => ({ value: e.id, label: e.name }));
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const empty = dataset.transactions.length === 0;

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader icon={PieChart} title="Reports" subtitle={<>The bigger picture · <span className="tnum">{fmtRange(range.from, range.to)}</span></>} accent={MONEY.net} />

      <Card pad={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-grey">Filters</span>
          <MultiSelect label="Account" options={accountOpts} selected={filters.accountIds ?? []} onChange={(v) => setF('accountIds', v)} />
          <MultiSelect label="Category" options={catOpts} selected={filters.categoryIds ?? []} onChange={(v) => setF('categoryIds', v)} />
          <MultiSelect label="Person" options={personOpts} selected={filters.personIds ?? []} onChange={(v) => setF('personIds', v)} />
          <MultiSelect label="Purpose" options={purposeOpts} selected={filters.purposeIds ?? []} onChange={(v) => setF('purposeIds', v)} />
          {eventOpts.length > 0 && <div style={{ width: 150 }}><Dropdown value={filters.eventId ?? ''} options={eventOpts} onChange={(v) => setF('eventId', v || undefined)} placeholder="Any event" size="sm" width="100%" /></div>}
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>Clear</Button>
        </div>
      </Card>

      <SubTabs
        tabs={[
          { key: 'money', label: 'Income & spending', color: MONEY.in },
          { key: 'categories', label: 'Categories', color: MONEY.out },
          { key: 'investments', label: 'Investments', color: MONEY.invest },
          { key: 'networth', label: 'Net worth', color: MONEY.net },
          { key: 'reimbursements', label: 'Reimbursements', color: MONEY.reimb },
          { key: 'people', label: 'People', color: MONEY.receivable },
          { key: 'reconcile', label: 'Reconciliation', color: MONEY.transfer },
          { key: 'year', label: 'Year in review', color: MONEY.save },
        ]}
        active={report}
        onChange={setReport}
      />

      {empty ? (
        <Card><EmptyState icon={PieChart} title="Nothing to report yet" hint="Add transactions and your reports fill in automatically." /></Card>
      ) : (
        <>
          {report === 'money' && <MoneyReport snap={snap} prev={prevSnap} look={look} meta={meta} range={range} />}
          {report === 'categories' && <CategoryReport eInput={eInput} range={range} look={look} meta={meta} />}
          {report === 'investments' && <InvestmentReport snap={snap} dataset={dataset} meta={meta} />}
          {report === 'networth' && <NetWorthReport snap={snap} meta={meta} range={range} />}
          {report === 'reimbursements' && <ReimbReport snap={snap} eInput={eInput} range={range} look={look} meta={meta} />}
          {report === 'people' && <PeopleReport eInput={eInput} dataset={dataset} range={range} meta={meta} />}
          {report === 'reconcile' && <ReconcileReport snap={snap} meta={meta} />}
          {report === 'year' && <YearReport eInput={eInput} range={range} look={look} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ shared bits */

function ExportBar({ filename, meta, rows, printBody }: { filename: string; meta: Row[]; rows: Row[]; printBody: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => { exportReportXlsx(filename, meta, rows); toast('Report exported', { tone: 'success' }); }} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-slate hover:border-brand/40"><FileDown size={13} /> xlsx</button>
      <button onClick={() => exportReportCsv(filename, meta, rows)} className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-slate hover:border-brand/40">CSV</button>
      <button onClick={() => printDocument(filename, printBody)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-slate hover:border-brand/40"><Printer size={13} /> Print</button>
    </div>
  );
}

function Insights({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Card className="border-brand/20 bg-brand/[0.03]">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-brand"><Lightbulb size={14} /> In short</div>
      <ul className="space-y-1">
        {items.map((s, i) => <li key={i} className="flex items-start gap-2 text-[13px] text-slate"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{s}</li>)}
      </ul>
    </Card>
  );
}

function metaPrintHeader(title: string, meta: Row[]): string {
  const range = meta.find((m) => m.Field === 'Date range')?.Value ?? '';
  const filters = meta.find((m) => m.Field === 'Filters')?.Value ?? '';
  return `<h1>${esc(title)}</h1><div class="sub">${esc(String(range))}${filters && filters !== 'None' ? ` · ${esc(String(filters))}` : ''}</div>`;
}
function tableHtml(headers: string[], rows: (string | number)[][]): string {
  return `<table><thead><tr>${headers.map((h, i) => `<th class="${i === 0 ? '' : 'r'}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? '' : 'r'}">${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

type Look = ReturnType<typeof buildLookups>;
type EInput = ReturnType<typeof datasetToEngineInput>;

/* ------------------------------------------------------ income & spending */

function MoneyReport({ snap, prev, look, meta, range }: { snap: Snapshot; prev: Snapshot; look: Look; meta: Row[]; range: DateRange }) {
  const insights = periodInsights(
    { incomePaise: snap.incomePaise, expensePaise: snap.expensePaise, savingsRate: snap.savingsRate, expenseByCategory: snap.expenseByCategory },
    { incomePaise: prev.incomePaise, expensePaise: prev.expensePaise, savingsRate: prev.savingsRate, expenseByCategory: prev.expenseByCategory },
    look.catName
  );
  const rows: Row[] = [
    { Metric: 'Money in', 'This period': snap.incomePaise / 100, 'Previous': prev.incomePaise / 100 },
    { Metric: 'Money spent', 'This period': snap.expensePaise / 100, 'Previous': prev.expensePaise / 100 },
    { Metric: 'Invested', 'This period': snap.investedPaise / 100, 'Previous': prev.investedPaise / 100 },
    { Metric: 'Savings', 'This period': snap.savingsPaise / 100, 'Previous': prev.savingsPaise / 100 },
    { Metric: 'Savings rate %', 'This period': snap.savingsRate ?? 0, 'Previous': prev.savingsRate ?? 0 },
  ];
  const printBody = metaPrintHeader('Income & spending', meta) + tableHtml(['Metric', 'This period', 'Previous'], rows.map((r) => [String(r.Metric), r.Metric === 'Savings rate %' ? `${Number(r['This period']).toFixed(1)}%` : fmtINR(Number(r['This period']) * 100), r.Metric === 'Savings rate %' ? `${Number(r['Previous']).toFixed(1)}%` : fmtINR(Number(r['Previous']) * 100)]));
  const cashflow = snap.cashflowSeries.map((p) => ({ label: p.label, value: p.netPaise, tipRows: [{ label: 'In', value: fmtINR(p.inPaise), color: MONEY.in }, { label: 'Out', value: fmtINR(p.outPaise), color: MONEY.out }] }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Money in" value={fmtINR(snap.incomePaise)} color={MONEY.in} />
          <MiniStat label="Spent" value={fmtINR(snap.expensePaise)} color={MONEY.out} />
          <MiniStat label="Invested" value={fmtINR(snap.investedPaise)} color={MONEY.invest} />
          <MiniStat label="Savings rate" value={snap.savingsRate == null ? '—' : fmtPct(snap.savingsRate)} color={MONEY.save} />
        </div>
        <ExportBar filename={`kosh-income-spending-${range.to}`} meta={meta} rows={rows} printBody={printBody} />
      </div>
      <Insights items={insights} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader icon={TrendingUp} title="In vs Spent vs Invested" accent={MONEY.net} /><Columns data={[{ key: 'in', label: 'In', value: snap.incomePaise, color: MONEY.in }, { key: 'out', label: 'Spent', value: snap.expensePaise, color: MONEY.out }, { key: 'inv', label: 'Invested', value: snap.investedPaise, color: MONEY.invest }]} format={fmtINR} yAxisFormat={fmtAxis} height={220} /></Card>
        <Card><CardHeader icon={TrendingUp} title="Cash-flow trend" accent={MONEY.net} /><LineArea points={cashflow} color={MONEY.net} format={fmtINR} yAxisFormat={fmtAxis} height={220} /></Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- category */

function CategoryReport({ eInput, range, look, meta }: { eInput: EInput; range: DateRange; look: Look; meta: Row[] }) {
  const bd = useMemo(() => spendBreakdown(eInput, range), [eInput, range]);
  const rows = Object.entries(bd.byCategory).filter(([, v]) => v.netPaise > 0).sort((a, b) => b[1].netPaise - a[1].netPaise);
  const total = bd.totalNetPaise;
  const donut: DonutDatum[] = rows.slice(0, 8).map(([c, v]) => ({ key: c || 'u', label: c ? look.catName(c) : 'Uncategorised', value: v.netPaise, color: c ? look.catColor(c) : MONEY.transfer }));
  const exportRows: Row[] = rows.map(([c, v]) => ({ Category: c ? look.catName(c) : 'Uncategorised', 'Spent (₹)': v.netPaise / 100, 'Share %': total ? +((v.netPaise / total) * 100).toFixed(1) : 0, Txns: v.count }));
  exportRows.push({ Category: 'TOTAL', 'Spent (₹)': total / 100, 'Share %': 100, Txns: rows.reduce((s, [, v]) => s + v.count, 0) });
  const printBody = metaPrintHeader('Category analysis', meta) + tableHtml(['Category', 'Spent', 'Share', 'Txns'], [...rows.map(([c, v]) => [c ? look.catName(c) : 'Uncategorised', fmtINR(v.netPaise), `${total ? ((v.netPaise / total) * 100).toFixed(1) : 0}%`, v.count]), ['TOTAL', fmtINR(total), '100%', rows.reduce((s, [, v]) => s + v.count, 0)]]);

  if (rows.length === 0) return <Card><EmptyState icon={PieChart} title="No spending in this period/filter" compact /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card><CardHeader icon={PieChart} title="Spend by category" accent={MONEY.out} right={<ExportBar filename={`kosh-categories-${range.to}`} meta={meta} rows={exportRows} printBody={printBody} />} /><Donut data={donut} format={fmtINR} centerTitle="Total" centerValue={fmtCompact(total)} height={240} /></Card>
      <Card pad={false}>
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-right">Spent</th><th className="px-3 py-2 text-right">Share</th><th className="px-3 py-2 text-right">Txns</th></tr></thead>
          <tbody>
            {rows.map(([c, v]) => (
              <tr key={c} className="border-b border-line/70 last:border-0">
                <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 font-semibold text-ink"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c ? look.catColor(c) : MONEY.transfer }} />{c ? look.catName(c) : 'Uncategorised'}</span></td>
                <td className="tnum px-3 py-2 text-right font-bold">{fmtINR(v.netPaise)}</td>
                <td className="tnum px-3 py-2 text-right text-grey">{fmtPct(total ? (v.netPaise / total) * 100 : 0)}</td>
                <td className="tnum px-3 py-2 text-right text-grey">{v.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- investments */

function InvestmentReport({ snap, dataset, meta }: { snap: Snapshot; dataset: Dataset; meta: Row[] }) {
  const pf = snap.portfolio;
  const invById = new Map(dataset.investments.map((i) => [i.id, i]));
  const holdings = Object.values(pf.byInvestment).filter((p) => p.units > 0 || p.costPaise > 0).sort((a, b) => b.valuePaise - a.valuePaise);
  const byPlatform: Record<string, number> = {};
  for (const p of holdings) byPlatform[invById.get(p.investmentId)?.platform ?? 'Other'] = (byPlatform[invById.get(p.investmentId)?.platform ?? 'Other'] ?? 0) + p.valuePaise;
  const donut: DonutDatum[] = Object.entries(byPlatform).map(([k, v]) => ({ key: k, label: k, value: v, color: MONEY.invest }));
  const rows: Row[] = holdings.map((p) => ({ Holding: invById.get(p.investmentId)?.name ?? '—', Platform: invById.get(p.investmentId)?.platform ?? '', Units: p.units, 'Invested (₹)': p.costPaise / 100, 'Value (₹)': p.valuePaise / 100, 'Unrealised (₹)': (p.unrealizedPaise ?? 0) / 100 }));
  const printBody = metaPrintHeader('Investment report', meta) + tableHtml(['Holding', 'Invested', 'Value', 'P/L'], holdings.map((p) => [invById.get(p.investmentId)?.name ?? '—', fmtINR(p.costPaise), fmtINR(p.valuePaise), p.hasPrice ? fmtINR(p.unrealizedPaise ?? 0) : '—']));

  if (holdings.length === 0) return <Card><EmptyState icon={TrendingUp} title="No holdings" compact /></Card>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Value" value={fmtCompact(pf.totalValuePaise)} color={MONEY.invest} />
          <MiniStat label="Invested" value={fmtCompact(pf.totalCostPaise)} color={MONEY.net} />
          <MiniStat label="Unrealised" value={fmtINR(pf.totalUnrealizedPaise)} color={pf.totalUnrealizedPaise >= 0 ? MONEY.in : MONEY.out} />
          <MiniStat label="Realised" value={fmtINR(pf.totalRealizedPaise)} color={pf.totalRealizedPaise >= 0 ? MONEY.in : MONEY.out} />
        </div>
        <ExportBar filename="kosh-investments" meta={meta} rows={rows} printBody={printBody} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card><CardHeader icon={PieChart} title="By platform" accent={MONEY.invest} /><Donut data={donut} format={fmtINR} centerTitle="Portfolio" centerValue={fmtCompact(pf.totalValuePaise)} height={230} /></Card>
        <Card pad={false}>
          <table className="w-full text-[12.5px]"><thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Holding</th><th className="px-3 py-2 text-right">Invested</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2 text-right">P/L</th></tr></thead>
            <tbody>{holdings.map((p) => <tr key={p.investmentId} className="border-b border-line/70 last:border-0"><td className="px-3 py-2 font-semibold text-ink">{invById.get(p.investmentId)?.name}</td><td className="tnum px-3 py-2 text-right text-slate">{fmtINR(p.costPaise)}</td><td className="tnum px-3 py-2 text-right font-semibold">{fmtINR(p.valuePaise)}</td><td className="tnum px-3 py-2 text-right font-bold" style={{ color: !p.hasPrice ? MONEY.transfer : (p.unrealizedPaise ?? 0) >= 0 ? MONEY.in : MONEY.out }}>{p.hasPrice ? fmtINR(p.unrealizedPaise ?? 0) : '—'}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- net worth */

function NetWorthReport({ snap, meta, range }: { snap: Snapshot; meta: Row[]; range: DateRange }) {
  const np = snap.netWorthParts;
  const parts: { label: string; value: number; color: string }[] = [
    { label: 'Bank & cash', value: np.bankCashPaise, color: MONEY.net },
    { label: 'Broker cash', value: np.brokerCashPaise, color: MONEY.transfer },
    { label: 'Investments', value: np.investmentsPaise, color: MONEY.invest },
    { label: 'Owed to you', value: np.receivablesPaise, color: MONEY.receivable },
    { label: 'Card payable', value: -np.cardPayablePaise, color: MONEY.card },
    { label: 'You owe', value: -np.borrowingsPaise, color: MONEY.payable },
  ];
  const rows: Row[] = parts.map((p) => ({ Component: p.label, 'Amount (₹)': p.value / 100 }));
  rows.push({ Component: 'NET WORTH', 'Amount (₹)': snap.netWorthPaise / 100 });
  const series = snap.netWorthSeries.map((p) => ({ label: p.label, value: p.valuePaise, tipRows: [{ label: 'Net worth', value: fmtINR(p.valuePaise) }] }));
  const printBody = metaPrintHeader('Net-worth report', meta) + tableHtml(['Component', 'Amount'], [...parts.map((p) => [p.label, fmtINR(p.value)]), ['NET WORTH', fmtINR(snap.netWorthPaise)]]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MiniStat label="Net worth today" value={fmtCompact(snap.netWorthPaise)} color={MONEY.net} />
        <ExportBar filename={`kosh-networth-${range.to}`} meta={meta} rows={rows} printBody={printBody} />
      </div>
      <Card><CardHeader icon={Landmark} title="Net-worth movement" accent={MONEY.net} /><LineArea points={series} color={MONEY.net} format={fmtINR} yAxisFormat={fmtAxis} height={240} /></Card>
      <Card pad={false}>
        <table className="w-full text-[12.5px]"><thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Component</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
          <tbody>{parts.map((p) => <tr key={p.label} className="border-b border-line/70"><td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-slate"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.label}</span></td><td className="tnum px-3 py-2 text-right font-semibold" style={{ color: p.value < 0 ? MONEY.out : '#0F172A' }}>{fmtINR(p.value)}</td></tr>)}
            <tr className="bg-canvas/50"><td className="px-3 py-2 font-bold text-ink">NET WORTH</td><td className="tnum px-3 py-2 text-right font-extrabold text-money-net">{fmtINR(snap.netWorthPaise)}</td></tr></tbody>
        </table>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- reimbursements */

function ReimbReport({ snap, eInput, range, look, meta }: { snap: Snapshot; eInput: EInput; range: DateRange; look: Look; meta: Row[] }) {
  const lines = useMemo(() => buildClaimableLines(eInput, range), [eInput, range]);
  const rows: Row[] = lines.map((l) => ({ Date: l.date, Expense: l.description, Category: look.catName(l.categoryId), 'Gross (₹)': l.grossPaise / 100, 'Claimable (₹)': l.claimablePaise / 100 }));
  const printBody = metaPrintHeader('Reimbursement report', meta) + tableHtml(['Date', 'Expense', 'Gross', 'Claimable'], lines.map((l) => [fmtDate(l.date), l.description, fmtINR(l.grossPaise), fmtINR(l.claimablePaise)]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Eligible (gross)" value={fmtINR(snap.reimb.eligibleGrossPaise)} color={MONEY.reimb} />
          <MiniStat label="Claimable" value={fmtINR(snap.reimb.claimablePaise)} color={MONEY.reimb} />
          <MiniStat label="Received" value={fmtINR(snap.reimb.receivedPaise)} color={MONEY.save} />
          <MiniStat label="Outstanding" value={fmtINR(snap.reimb.outstandingPaise)} color={MONEY.receivable} />
        </div>
        <ExportBar filename={`kosh-reimbursements-${range.to}`} meta={meta} rows={rows} printBody={printBody} />
      </div>
      {lines.length === 0 ? <Card><EmptyState icon={Receipt} title="Nothing claimable in this period" compact /></Card> : (
        <Card pad={false}><table className="w-full text-[12.5px]"><thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Expense</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Claimable</th></tr></thead>
          <tbody>{lines.map((l) => <tr key={l.txnId} className="border-b border-line/70 last:border-0"><td className="tnum px-3 py-2 text-grey">{fmtDate(l.date)}</td><td className="px-3 py-2 font-semibold text-ink">{l.description || look.catName(l.categoryId)}</td><td className="tnum px-3 py-2 text-right text-slate">{fmtINR(l.grossPaise)}</td><td className="tnum px-3 py-2 text-right font-bold text-money-reimb">{fmtINR(l.claimablePaise)}</td></tr>)}</tbody>
        </table></Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ people */

function PeopleReport({ eInput, dataset, range, meta }: { eInput: EInput; dataset: Dataset; range: DateRange; meta: Row[] }) {
  const pos = useMemo(() => personPositions(eInput, range.to), [eInput, range.to]);
  const rows2 = dataset.people.map((p) => ({ p, pos: pos[p.id] })).filter((x) => x.pos && x.pos.netPaise !== 0).sort((a, b) => Math.abs(b.pos!.netPaise) - Math.abs(a.pos!.netPaise));
  const owed = rows2.reduce((s, x) => s + Math.max(0, x.pos!.netPaise), 0);
  const owe = rows2.reduce((s, x) => s + Math.max(0, -x.pos!.netPaise), 0);
  const rows: Row[] = rows2.map((x) => ({ Person: x.p.name, 'Owes you (₹)': Math.max(0, x.pos!.netPaise) / 100, 'You owe (₹)': Math.max(0, -x.pos!.netPaise) / 100 }));
  const printBody = metaPrintHeader('People — outstanding', meta) + tableHtml(['Person', 'Owes you', 'You owe'], rows2.map((x) => [x.p.name, x.pos!.netPaise > 0 ? fmtINR(x.pos!.netPaise) : '—', x.pos!.netPaise < 0 ? fmtINR(-x.pos!.netPaise) : '—']));
  if (rows2.length === 0) return <Card><EmptyState icon={Users} title="All settled up" compact /></Card>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-3"><MiniStat label="Owed to you" value={fmtINR(owed)} color={MONEY.receivable} /><MiniStat label="You owe" value={fmtINR(owe)} color={MONEY.payable} /></div>
        <ExportBar filename={`kosh-people-${range.to}`} meta={meta} rows={rows} printBody={printBody} />
      </div>
      <Card pad={false}><table className="w-full text-[12.5px]"><thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-right">Owes you</th><th className="px-3 py-2 text-right">You owe</th></tr></thead>
        <tbody>{rows2.map((x) => <tr key={x.p.id} className="border-b border-line/70 last:border-0"><td className="px-3 py-2 font-semibold text-ink">{x.p.name}</td><td className="tnum px-3 py-2 text-right font-bold text-money-receivable">{x.pos!.netPaise > 0 ? fmtINR(x.pos!.netPaise) : '—'}</td><td className="tnum px-3 py-2 text-right font-bold text-money-payable">{x.pos!.netPaise < 0 ? fmtINR(-x.pos!.netPaise) : '—'}</td></tr>)}</tbody>
      </table></Card>
    </div>
  );
}

/* ------------------------------------------------------------ reconciliation */

function ReconcileReport({ snap, meta }: { snap: Snapshot; meta: Row[] }) {
  const rows: Row[] = snap.balances.map((b) => ({ Account: b.account.name, Type: b.account.type, 'Opening (₹)': b.account.openingBalancePaise / 100, 'Current (₹)': b.balancePaise / 100 }));
  const printBody = metaPrintHeader('Account reconciliation', meta) + tableHtml(['Account', 'Opening', 'Current'], snap.balances.map((b) => [b.account.name, fmtINR(b.account.openingBalancePaise), fmtINR(b.balancePaise)]));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-grey">Each account's current balance = opening balance + every recorded movement. Import a statement to verify against the bank.</p>
        <ExportBar filename="kosh-reconciliation" meta={meta} rows={rows} printBody={printBody} />
      </div>
      <Card pad={false}><table className="w-full text-[12.5px]"><thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Opening</th><th className="px-3 py-2 text-right">Current</th></tr></thead>
        <tbody>{snap.balances.map((b) => <tr key={b.account.id} className="border-b border-line/70 last:border-0"><td className="px-3 py-2 font-semibold text-ink">{b.account.name}</td><td className="px-3 py-2 text-grey">{b.account.type.replace('_', ' ')}</td><td className="tnum px-3 py-2 text-right text-slate">{fmtINR(b.account.openingBalancePaise)}</td><td className="tnum px-3 py-2 text-right font-bold" style={{ color: b.balancePaise < 0 ? MONEY.out : '#0F172A' }}>{fmtINR(b.balancePaise)}</td></tr>)}</tbody>
      </table></Card>
    </div>
  );
}

/* ---------------------------------------------------------- year in review */

function YearReport({ eInput, range, look }: { eInput: EInput; range: DateRange; look: Look }) {
  const year = range.to.slice(0, 4);
  const yearRange: DateRange = { from: startOfYear(range.to), to: range.to };
  const snap = useMemo(() => computeSnapshot(eInput, yearRange), [eInput, yearRange]);
  const bd = useMemo(() => spendBreakdown(eInput, yearRange), [eInput, yearRange]);
  const topCat = Object.entries(bd.byCategory).filter(([, v]) => v.netPaise > 0).sort((a, b) => b[1].netPaise - a[1].netPaise)[0];
  const topBars: HBarDatum[] = Object.entries(bd.byCategory).filter(([, v]) => v.netPaise > 0).sort((a, b) => b[1].netPaise - a[1].netPaise).slice(0, 6).map(([c, v]) => ({ key: c || 'u', label: c ? look.catName(c) : 'Uncategorised', value: v.netPaise, color: c ? look.catColor(c) : MONEY.transfer, valueLabel: fmtINR(v.netPaise) }));

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-6 py-6 text-white shadow-pop">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/80"><Trophy size={14} /> {year} in review</div>
          <h2 className="mt-1 font-display text-[24px] font-extrabold">You earned {fmtCompact(snap.incomePaise)} and saved {snap.savingsRate == null ? '—' : fmtPct(snap.savingsRate)}.</h2>
          <p className="mt-1 text-[13px] text-white/85">Spent {fmtCompact(snap.expensePaise)}, invested {fmtCompact(snap.investedPaise)}. Net worth today: {fmtCompact(snap.netWorthPaise)}.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Earned" value={fmtCompact(snap.incomePaise)} color={MONEY.in} />
        <MiniStat label="Spent" value={fmtCompact(snap.expensePaise)} color={MONEY.out} />
        <MiniStat label="Invested" value={fmtCompact(snap.investedPaise)} color={MONEY.invest} />
        <MiniStat label="Biggest category" value={topCat ? look.catName(topCat[0]) : '—'} sub={topCat ? fmtINR(topCat[1].netPaise) : undefined} color={MONEY.out} />
      </div>
      {topBars.length > 0 && <Card><CardHeader icon={Sparkles} title={`Where ${year} went`} accent={MONEY.out} /><HBars data={topBars} format={fmtINR} barSize={26} labelWidth={130} /></Card>}
    </div>
  );
}
