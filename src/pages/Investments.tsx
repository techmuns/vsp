import { Fragment, useMemo, useState } from 'react';
import { TrendingUp, PieChart, Activity, Plus, RefreshCw, Wifi, WifiOff, Link2, Pencil, Trash2 } from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { Snapshot } from '../engine';
import { latestPriceAsOf, getTxnType, INVESTMENT_TYPES } from '../engine';
import type { Price } from '../db/types';
import { isStalePrice, type MarketPricesState } from '../app/market';
import type { DateRange } from '../lib/dates';
import { MONEY, colorForId } from '../lib/brand';
import { fmtINR, fmtCompact, fmtPct, fmtUnits, fmtDate } from '../lib/format';
import { upsertPrice, saveInvestment, deleteTransaction } from '../db/repo';
import { toast } from '../app/toast';
import { askConfirm } from '../app/confirm';
import { useApp } from '../app/context';
import { Card, PageHeader, CardHeader, EmptyState, Badge, MiniStat } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { Button, AmountField, DateField, TextField } from '../components/ui/Controls';
import { Donut, type DonutDatum } from '../components/charts/Donut';
import { Columns } from '../components/charts/Columns';
import { InstrumentSearch } from '../components/quickadd/InstrumentSearch';

type Tab = 'holdings' | 'allocation' | 'activity' | 'prices';

export default function Investments({ dataset, snapshot, range, prices, market }: { dataset: Dataset; snapshot: Snapshot; range: DateRange; prices: Price[]; market: MarketPricesState }) {
  const app = useApp();
  const [tab, setTab] = useState<Tab>('holdings');
  const pf = snapshot.portfolio;
  const invById = useMemo(() => new Map(dataset.investments.map((i) => [i.id, i])), [dataset.investments]);
  const asOf = range.to;

  const empty = dataset.investments.length === 0;
  const plPct = pf.totalCostPaise > 0 ? (pf.totalUnrealizedPaise / pf.totalCostPaise) * 100 : null;

  if (empty) {
    return (
      <div className="animate-fade-up">
        <PageHeader icon={TrendingUp} title="Investments" subtitle="Your portfolio, clearly." accent={MONEY.invest} />
        <Card><EmptyState icon={TrendingUp} title="No investments yet" hint="Record a buy from Quick-add or the editor to start tracking your portfolio." action={<Button icon={Plus} onClick={() => app.openEditor({ prefill: { type: 'investment_buy' } })}>Record a buy</Button>} /></Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader icon={TrendingUp} title="Investments" subtitle="Your portfolio, clearly." accent={MONEY.invest}
        right={<Button size="sm" icon={Plus} onClick={() => app.openEditor({ prefill: { type: 'investment_buy' } })}>Record activity</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Portfolio value" value={fmtCompact(pf.totalValuePaise)} color={MONEY.invest} />
        <MiniStat label="Invested" value={fmtCompact(pf.totalCostPaise)} color={MONEY.net} />
        <MiniStat label="Unrealised P/L" value={fmtINR(pf.totalUnrealizedPaise)} color={pf.totalUnrealizedPaise >= 0 ? MONEY.in : MONEY.out} sub={plPct == null ? 'No prices yet' : fmtPct(plPct)} />
        <MiniStat label="Realised P/L" value={fmtINR(pf.totalRealizedPaise)} color={pf.totalRealizedPaise >= 0 ? MONEY.in : MONEY.out} sub={pf.totalDividendsPaise > 0 ? `+${fmtINR(pf.totalDividendsPaise)} dividends` : undefined} />
      </div>

      <SubTabs
        tabs={[
          { key: 'holdings', label: 'Holdings', color: MONEY.invest },
          { key: 'allocation', label: 'Allocation', color: MONEY.net },
          { key: 'activity', label: 'Activity', color: MONEY.transfer },
          { key: 'prices', label: 'Prices', color: MONEY.save },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'holdings' && <Holdings pf={pf} prices={prices} invById={invById} asOf={asOf} />}
      {tab === 'allocation' && <Allocation pf={pf} invById={invById} />}
      {tab === 'activity' && <ActivityTab dataset={dataset} invById={invById} />}
      {tab === 'prices' && <Prices dataset={dataset} pf={pf} prices={prices} asOf={asOf} market={market} />}
    </div>
  );
}

type PF = Snapshot['portfolio'];
type InvMap = Map<string, Dataset['investments'][number]>;

function priceMeta(prices: Price[], invId: string, asOf: string) {
  const p = latestPriceAsOf(prices, invId, asOf);
  return p ? { source: p.source, date: p.date, pricePaise: p.pricePaise, stale: isStalePrice(p.date, asOf) } : null;
}

type AssetClass = 'Mutual funds' | 'Stocks' | 'Other';
const CLASS_ORDER: AssetClass[] = ['Mutual funds', 'Stocks', 'Other'];
const CLASS_COLOR: Record<AssetClass, string> = { 'Mutual funds': MONEY.invest, Stocks: MONEY.net, Other: MONEY.transfer };

/** Infer the class from the identifier first (robust even if assetType wasn't set). */
function assetClassOf(inv?: Dataset['investments'][number]): AssetClass {
  if (!inv) return 'Other';
  if (inv.isin) return 'Mutual funds';
  if (inv.symbol || inv.assetType === 'stock' || inv.assetType === 'etf') return 'Stocks';
  if (inv.assetType === 'mutual_fund') return 'Mutual funds';
  return 'Other';
}

function Holdings({ pf, prices, invById, asOf }: { pf: PF; prices: Price[]; invById: InvMap; asOf: string }) {
  const rows = Object.values(pf.byInvestment).filter((p) => p.units > 0 || p.costPaise > 0).sort((a, b) => b.valuePaise - a.valuePaise);
  if (rows.length === 0) return <Card><EmptyState icon={TrendingUp} title="No open holdings" hint="Buys will show here with cost and value." compact /></Card>;
  const groups = CLASS_ORDER.map((cls) => {
    const gr = rows.filter((p) => assetClassOf(invById.get(p.investmentId)) === cls);
    return { cls, rows: gr, value: gr.reduce((s, p) => s + p.valuePaise, 0) };
  }).filter((g) => g.rows.length > 0);
  const grouped = groups.length > 1;
  return (
    <Card pad={false}>
      <div className="nice-scroll overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey">
            <th className="px-3 py-2 text-left">Holding</th><th className="px-3 py-2 text-right">Units</th><th className="px-3 py-2 text-right">Avg cost</th><th className="px-3 py-2 text-right">Invested</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2 text-right">P/L</th><th className="px-3 py-2 text-right">Price / NAV</th>
          </tr></thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.cls}>
                {grouped && (
                  <tr className="bg-canvas/70">
                    <td colSpan={4} className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: CLASS_COLOR[g.cls] }}>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[g.cls] }} />{g.cls} · {g.rows.length}</span>
                    </td>
                    <td className="tnum px-3 py-1.5 text-right text-[11px] font-bold text-ink">{fmtINR(g.value)}</td>
                    <td colSpan={2} />
                  </tr>
                )}
                {g.rows.map((p) => {
                  const inv = invById.get(p.investmentId);
                  const avg = p.units > 0 ? p.costPaise / p.units : 0;
                  const meta = priceMeta(prices, p.investmentId, asOf);
                  const plPct = p.costPaise > 0 && p.unrealizedPaise != null ? (p.unrealizedPaise / p.costPaise) * 100 : null;
                  return (
                    <tr key={p.investmentId} className="border-b border-line/70 last:border-0">
                      <td className="px-3 py-2"><div className="font-semibold text-ink">{inv?.name ?? '—'}</div><div className="text-[11px] text-grey">{inv?.platform}{inv?.symbol ? ` · ${inv.symbol}` : ''}</div></td>
                      <td className="tnum px-3 py-2 text-right text-slate">{fmtUnits(p.units)}</td>
                      <td className="tnum px-3 py-2 text-right text-grey">{avg > 0 ? fmtINR(Math.round(avg)) : '—'}</td>
                      <td className="tnum px-3 py-2 text-right text-slate">{fmtINR(p.costPaise)}</td>
                      <td className="tnum px-3 py-2 text-right font-semibold text-ink">{fmtINR(p.valuePaise)}</td>
                      <td className="tnum px-3 py-2 text-right font-bold" style={{ color: !p.hasPrice ? MONEY.transfer : (p.unrealizedPaise ?? 0) >= 0 ? MONEY.in : MONEY.out }}>
                        {!p.hasPrice ? '—' : <>{fmtINR(p.unrealizedPaise!)}{plPct != null && <span className="ml-1 text-[10.5px] font-semibold">{plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%</span>}</>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {meta ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="tnum text-[12.5px] font-semibold text-ink">{fmtINR(meta.pricePaise)}</span>
                            <span className="inline-flex items-center gap-1 text-[10.5px]">
                              <span className="text-grey">{fmtDate(meta.date)}</span>
                              <Badge color={meta.source === 'demo' || meta.source === 'manual' ? MONEY.transfer : MONEY.reimb}>{meta.source}</Badge>
                              {meta.stale && <Badge color={MONEY.out}>stale</Badge>}
                            </span>
                          </div>
                        ) : <span className="text-[11px] italic text-muted">No price yet</span>}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {pf.totalRealizedPaise !== 0 && (
              <tr className="bg-canvas/50"><td colSpan={7} className="px-3 py-2 text-[11.5px] text-grey">Realised P/L to date: <b className="tnum" style={{ color: pf.totalRealizedPaise >= 0 ? MONEY.in : MONEY.out }}>{fmtINR(pf.totalRealizedPaise)}</b></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Allocation({ pf, invById }: { pf: PF; invById: InvMap }) {
  const byPlatform: Record<string, number> = {};
  const byAsset: Record<string, number> = {};
  for (const p of Object.values(pf.byInvestment)) {
    if (p.valuePaise <= 0) continue;
    const inv = invById.get(p.investmentId);
    byPlatform[inv?.platform ?? 'Other'] = (byPlatform[inv?.platform ?? 'Other'] ?? 0) + p.valuePaise;
    byAsset[inv?.assetType ?? 'other'] = (byAsset[inv?.assetType ?? 'other'] ?? 0) + p.valuePaise;
  }
  const ASSET_LABEL: Record<string, string> = { stock: 'Stocks', mutual_fund: 'Mutual funds', etf: 'ETFs', other: 'Other' };
  const platformDonut: DonutDatum[] = Object.entries(byPlatform).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v, color: colorForId(k) }));
  const assetDonut: DonutDatum[] = Object.entries(byAsset).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: ASSET_LABEL[k] ?? k, value: v, color: colorForId(k) }));

  if (platformDonut.length === 0) return <Card><EmptyState icon={PieChart} title="No valued holdings" hint="Add prices to see allocation by current value." compact /></Card>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader icon={PieChart} title="By platform" accent={MONEY.net} /><Donut data={platformDonut} format={fmtINR} centerTitle="Portfolio" centerValue={fmtCompact(pf.totalValuePaise)} height={230} /></Card>
      <Card><CardHeader icon={PieChart} title="By asset type" accent={MONEY.invest} /><Donut data={assetDonut} format={fmtINR} centerTitle="Portfolio" centerValue={fmtCompact(pf.totalValuePaise)} height={230} /></Card>
      <Card className="lg:col-span-2">
        <CardHeader icon={TrendingUp} title="Invested vs current value" accent={MONEY.invest} />
        <Columns data={[{ key: 'inv', label: 'Invested', value: pf.totalCostPaise, color: MONEY.net }, { key: 'val', label: 'Value', value: pf.totalValuePaise, color: MONEY.invest }]} format={fmtINR} yAxisFormat={fmtCompact} height={200} />
      </Card>
    </div>
  );
}

function ActivityTab({ dataset, invById }: { dataset: Dataset; invById: InvMap }) {
  const app = useApp();
  const acts = dataset.transactions.filter((t) => !t.voided && t.investmentId && INVESTMENT_TYPES.has(t.type)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const quick = (type: string, label: string) => <Button variant="outline" size="sm" onClick={() => app.openEditor({ prefill: { type } })}>{label}</Button>;

  async function handleDelete(t: Dataset['transactions'][number]) {
    const def = getTxnType(t.type);
    const inv = invById.get(t.investmentId!);
    const ok = await askConfirm({
      title: 'Delete this entry?',
      message: `${inv?.name ? inv.name + ' · ' : ''}${def?.label ?? 'Entry'} · ${fmtINR(t.amountPaise)}. This permanently removes it from your records.`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    await deleteTransaction(t.id);
    toast('Entry deleted', { tone: 'error' });
  }
  return (
    <Card pad={false}>
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        {quick('investment_buy', 'Buy')}
        {quick('investment_sell', 'Sell')}
        {quick('investment_contribution', 'SIP / add')}
        {quick('investment_dividend', 'Dividend')}
        {quick('investment_charge', 'Charge')}
      </div>
      {acts.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" hint="Record buys, sells, SIPs, dividends and charges." compact />
      ) : (
        <>
          <div className="border-b border-line bg-canvas/40 px-3 py-1.5 text-[11px] text-grey">Full ledger of every investment entry — tap a row to edit, or use the trash icon to delete a wrong one.</div>
          <div className="divide-y divide-line">
            {acts.map((t) => {
              const def = getTxnType(t.type);
              const inv = invById.get(t.investmentId!);
              const out = def?.direction === 'out';
              return (
                <div key={t.id} className="flex items-center gap-2 pr-2 hover:bg-canvas">
                  <button onClick={() => app.openEditor({ txnId: t.id })} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-money-invest/12 text-[11px] font-bold text-money-invest">{def?.label?.slice(0, 1)}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold text-ink">{inv?.name ?? t.description ?? def?.label}</div><div className="text-[11px] text-grey">{fmtDate(t.date)} · {def?.label}{t.units ? ` · ${fmtUnits(t.units)} units` : ''}</div></div>
                    <span className="tnum shrink-0 font-bold" style={{ color: out ? MONEY.out : MONEY.in }}>{out ? '−' : '+'}{fmtINR(t.amountPaise)}</span>
                  </button>
                  <button onClick={() => handleDelete(t)} title="Delete this entry" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-grey transition hover:bg-money-out/10 hover:text-money-out"><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function Prices({ dataset, pf, prices, asOf, market }: { dataset: Dataset; pf: PF; prices: Price[]; asOf: string; market: MarketPricesState }) {
  const rows = dataset.investments.filter((i) => i.active);
  return (
    <div className="space-y-4">
      <Card pad={false} className="flex items-center gap-2 p-3 text-[12.5px]">
        {market.error ? <WifiOff size={16} className="text-grey" /> : market.rows.length ? <Wifi size={16} className="text-money-save" /> : <RefreshCw size={16} className="text-grey" />}
        <span className="text-slate">
          {market.rows.length ? <>Live feed loaded · <b>{market.rows.length}</b> prices. Manual entries always override.</> : market.error ? 'No live feed yet (offline-safe). Add prices manually below.' : 'Live feed not published yet — add prices manually below.'}
        </span>
      </Card>
      <Card pad={false}>
        <div className="divide-y divide-line">
          {rows.map((inv) => {
            const pos = pf.byInvestment[inv.id];
            const meta = priceMeta(prices, inv.id, asOf);
            return <PriceRow key={inv.id} inv={inv} pricePaise={pos?.pricePaise ?? null} meta={meta} />;
          })}
        </div>
      </Card>
    </div>
  );
}

function PriceRow({ inv, pricePaise, meta }: { inv: Dataset['investments'][number]; pricePaise: number | null; meta: { source: string; date: string; stale: boolean } | null }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState<number | null>(pricePaise);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const isMF = inv.assetType === 'mutual_fund';
  const idValue = inv.isin || inv.symbol || '';
  const canLink = inv.assetType !== 'other';
  const [linking, setLinking] = useState(false);
  const [manualLink, setManualLink] = useState(false);
  const [idInput, setIdInput] = useState(idValue);
  const live = meta ? meta.source !== 'demo' && meta.source !== 'manual' : false;

  const applyIdentifier = async (code: string) => {
    const v = code.trim().toUpperCase();
    await saveInvestment({ ...inv, isin: isMF ? v || undefined : inv.isin, symbol: isMF ? inv.symbol : v || undefined });
    toast(v ? 'Linked — live price updates daily' : 'Live link cleared', { tone: 'success' });
    setLinking(false);
    setManualLink(false);
  };
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">{inv.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-grey">
            <span>{inv.platform}</span>
            {idValue ? (
              <button onClick={() => { setIdInput(idValue); setLinking((v) => !v); }} className="inline-flex items-center gap-1 rounded bg-canvas px-1.5 py-0.5 font-medium text-slate hover:text-ink" title="Edit the ISIN / ticker used for live prices">
                {idValue}
                {live && <Wifi size={10} className="text-money-save" />}
                <Pencil size={10} />
              </button>
            ) : canLink ? (
              <button onClick={() => { setIdInput(''); setLinking(true); }} className="inline-flex items-center gap-1 rounded bg-money-save/12 px-1.5 py-0.5 font-semibold text-money-save hover:bg-money-save/20">
                <Link2 size={10} /> Link for live {isMF ? 'NAV' : 'price'}
              </button>
            ) : null}
          </div>
        </div>
        {!editing ? (
          <>
            <div className="text-right">
              <div className="tnum font-semibold text-ink">{pricePaise != null ? fmtINR(pricePaise) : <span className="italic text-muted">—</span>}</div>
              {meta && <div className="text-[10.5px] text-grey">{fmtDate(meta.date)} · {meta.source}{meta.stale ? ' · stale' : ''}</div>}
            </div>
            <Button variant="outline" size="sm" onClick={() => { setPrice(pricePaise); setEditing(true); }}>Update</Button>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="w-28"><AmountField paise={price} onPaise={setPrice} placeholder="per unit" /></div>
            <div className="w-36"><DateField value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <Button size="sm" disabled={!price} onClick={async () => { if (price) { await upsertPrice({ investmentId: inv.id, date, pricePaise: price, source: 'manual', asOf: date }); toast('Price updated', { tone: 'success' }); setEditing(false); } }}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>×</Button>
          </div>
        )}
      </div>
      {linking && (
        <div className="mt-2 space-y-1.5 rounded-xl bg-canvas/60 p-2">
          {!manualLink ? (
            <>
              <InstrumentSearch kind={isMF ? 'fund' : 'stock'} onPick={(h) => applyIdentifier(h.id)} autoFocus />
              <div className="flex items-center justify-between px-0.5">
                <button type="button" onClick={() => { setIdInput(idValue); setManualLink(true); }} className="text-[11px] font-medium text-brand hover:underline">
                  Type the code manually
                </button>
                <button type="button" onClick={() => setLinking(false)} className="text-[11px] font-medium text-grey hover:text-ink">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <div className="flex-1"><TextField autoFocus value={idInput} placeholder={isMF ? 'ISIN — e.g. INF…' : 'Ticker — e.g. RELIANCE.NS'} onChange={(e) => setIdInput(e.target.value)} /></div>
                <Button size="sm" onClick={() => applyIdentifier(idInput)}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setLinking(false)}>×</Button>
              </div>
              <button type="button" onClick={() => setManualLink(false)} className="px-0.5 text-[11px] font-medium text-brand hover:underline">
                ← Search by name instead
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
