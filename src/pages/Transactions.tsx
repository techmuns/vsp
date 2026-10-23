import { useMemo, useState, useEffect, useRef } from 'react';
import {
  ArrowLeftRight,
  Search,
  SlidersHorizontal,
  X,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Ban,
  Trash2,
  Link2,
  FileDown,
  Save,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Bookmark,
  CheckSquare,
  UploadCloud,
  Sparkles,
} from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { Snapshot } from '../engine';
import { getTxnType, listTxnTypes, summarizeLedger } from '../engine';
import type { DateRange } from '../lib/dates';
import type { Transaction, TxnStatus } from '../db/types';
import { applyTxnFilter, countActiveFilters, emptyFilter, type TxnFilter } from '../app/txnFilter';
import { takePendingTxnFilter } from '../app/pendingFilter';
import { buildLookups } from '../app/lookups';
import { useApp } from '../app/context';
import { MONEY, withAlpha } from '../lib/brand';
import { fmtINR, fmtDate } from '../lib/format';
import { addTransaction, deleteTransaction, removeTxnFilter, saveTxnFilter, updateTransaction, voidTransaction } from '../db/repo';
import { getSplits } from '../db/repo';
import { exportCsv, exportXlsx, type Row } from '../lib/exporters';
import { toast } from '../app/toast';
import { Card, PageHeader, Badge, EmptyState } from '../components/ui/Card';
import { Button, Dropdown, MultiSelect, TextField, AmountField, type Option } from '../components/ui/Controls';

const PAGE_SIZE = 50;
type SortKey = 'date' | 'description' | 'amount' | 'type' | 'category' | 'account' | 'status';

export default function Transactions({ dataset, range }: { dataset: Dataset; snapshot: Snapshot; range: DateRange }) {
  const app = useApp();
  const look = useMemo(() => buildLookups(dataset), [dataset]);
  const [filter, setFilter] = useState<TxnFilter>(emptyFilter);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linkFor, setLinkFor] = useState<Transaction | null>(null);

  // Consume a pre-filter handed over from another page (e.g. Expenses drill-in).
  useEffect(() => {
    const p = takePendingTxnFilter();
    if (p) {
      setFilter({ ...emptyFilter(), ...p });
      setShowFilters(true);
      setPage(0);
    }
  }, []);

  const set = <K extends keyof TxnFilter>(k: K, v: TxnFilter[K]) => {
    setFilter((f) => ({ ...f, [k]: v }));
    setPage(0);
  };

  const filtered = useMemo(() => applyTxnFilter(dataset.transactions, filter, range), [dataset.transactions, filter, range]);
  const summary = useMemo(() => summarizeLedger(filtered), [filtered]);

  const sorted = useMemo(() => {
    const val = (t: Transaction): string | number => {
      switch (sort.key) {
        case 'date': return `${t.date} ${String(t.createdAt).padStart(16, '0')}`;
        case 'description': return (t.description ?? getTxnType(t.type)?.label ?? '').toLowerCase();
        case 'amount': return t.amountPaise;
        case 'type': return getTxnType(t.type)?.label ?? t.type;
        case 'category': return look.catName(t.categoryId).toLowerCase();
        case 'account': return look.accName(t.accountId).toLowerCase();
        case 'status': return t.status;
      }
    };
    const arr = [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort, look]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { if (page >= pageCount) setPage(0); }, [pageCount, page]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'amount' || key === 'date' ? 'desc' : 'asc' }));
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((t) => selected.has(t.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPageSelected) pageRows.forEach((t) => next.delete(t.id));
    else pageRows.forEach((t) => next.add(t.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const active = countActiveFilters(filter);

  function doExport(kind: 'xlsx' | 'csv') {
    const rows: Row[] = sorted.map((t) => {
      const dir = getTxnType(t.type)?.direction ?? 'neutral';
      const signed = dir === 'in' ? t.amountPaise / 100 : dir === 'out' ? -t.amountPaise / 100 : 0;
      return {
        Date: t.date,
        Description: t.description ?? getTxnType(t.type)?.label ?? '',
        Type: getTxnType(t.type)?.label ?? t.type,
        Category: t.categoryId ? look.catName(t.categoryId) : '',
        Account: t.accountId ? look.accName(t.accountId) : '',
        Person: t.personId ? look.personName(t.personId) : '',
        Event: t.eventId ? (dataset.events.find((e) => e.id === t.eventId)?.name ?? '') : '',
        Purpose: t.purposeId ? look.purposeName(t.purposeId) : '',
        Status: t.status,
        'Amount (₹)': signed,
        Reference: t.reference ?? '',
        Tags: (t.tags ?? []).join(', '),
        Notes: t.notes ?? '',
      };
    });
    const name = `kosh-transactions-${new Date().toISOString().slice(0, 10)}`;
    if (kind === 'xlsx') exportXlsx(name, 'Transactions', rows);
    else exportCsv(name, rows);
    toast(`Exported ${rows.length} transactions`, { tone: 'success' });
  }

  const empty = dataset.transactions.length === 0;

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        icon={ArrowLeftRight}
        title="Transactions"
        subtitle="Every rupee in and out — search, filter and edit."
        accent={MONEY.transfer}
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={FileDown} onClick={() => doExport('xlsx')}>xlsx</Button>
            <Button variant="outline" size="sm" onClick={() => doExport('csv')}>CSV</Button>
            <Button variant="outline" size="sm" icon={UploadCloud} onClick={() => app.openImport()}>Import</Button>
            {dataset.settings?.aiEnabled && (
              <Button variant="outline" size="sm" icon={Sparkles} onClick={() => app.openAi()}>Suggest</Button>
            )}
            <Button size="sm" icon={Plus} onClick={() => app.openEditor()}>Add</Button>
          </div>
        }
      />

      {/* summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Transactions" value={summary.count.toString()} color={MONEY.net} />
        <SummaryStat label="Money in" value={fmtINR(summary.moneyInPaise)} color={MONEY.in} />
        <SummaryStat label="Money out" value={fmtINR(summary.moneyOutPaise)} color={MONEY.out} />
        <SummaryStat label="Net" value={fmtINR(summary.netPaise)} color={summary.netPaise >= 0 ? MONEY.save : MONEY.out} />
      </div>

      {/* search + filter toggle + saved */}
      <Card pad={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={filter.search}
              onChange={(e) => set('search', e.target.value)}
              placeholder="Search description, reference, notes, tags…"
              className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-[13px] text-ink outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <Button variant={showFilters || active ? 'soft' : 'outline'} size="sm" icon={SlidersHorizontal} onClick={() => setShowFilters((s) => !s)}>
            Filters{active ? ` · ${active}` : ''}
          </Button>
          <SavedFilters dataset={dataset} filter={filter} onApply={(f) => { setFilter(f); setPage(0); }} />
        </div>

        {showFilters && <FilterBar dataset={dataset} look={look} filter={filter} set={set} onClear={() => setFilter(emptyFilter())} />}

        {active > 0 && <ActiveChips dataset={dataset} look={look} filter={filter} set={set} onClear={() => setFilter(emptyFilter())} />}
      </Card>

      {/* bulk bar */}
      {selected.size > 0 && (
        <BulkBar
          dataset={dataset}
          count={selected.size}
          ids={[...selected]}
          onDone={() => setSelected(new Set())}
        />
      )}

      {/* table */}
      <Card pad={false}>
        {empty ? (
          <EmptyState icon={ArrowLeftRight} title="No transactions yet" hint="Add your first one to start the ledger." action={<Button icon={Plus} onClick={() => app.openEditor()}>Add transaction</Button>} />
        ) : sorted.length === 0 ? (
          <EmptyState icon={Search} title="Nothing matches" hint="Try loosening or clearing your filters." action={<Button variant="soft" onClick={() => setFilter(emptyFilter())}>Clear filters</Button>} compact />
        ) : (
          <>
            <div className="nice-scroll overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-canvas text-grey">
                    <th className="w-9 px-2 py-2">
                      <Checkbox checked={allOnPageSelected} onChange={toggleAll} />
                    </th>
                    <Th label="Date" k="date" sort={sort} onSort={toggleSort} />
                    <Th label="Description" k="description" sort={sort} onSort={toggleSort} />
                    <Th label="Category" k="category" sort={sort} onSort={toggleSort} />
                    <Th label="Account" k="account" sort={sort} onSort={toggleSort} />
                    <Th label="Type" k="type" sort={sort} onSort={toggleSort} />
                    <Th label="Amount" k="amount" sort={sort} onSort={toggleSort} align="right" />
                    <th className="w-9 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t) => (
                    <TxnRow
                      key={t.id}
                      t={t}
                      look={look}
                      dataset={dataset}
                      selected={selected.has(t.id)}
                      onToggle={() => toggleOne(t.id)}
                      onEdit={() => app.openEditor({ txnId: t.id })}
                      onLink={() => setLinkFor(t)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-grey">
              <span>
                Showing <b className="text-slate">{page * PAGE_SIZE + 1}–{Math.min(sorted.length, (page + 1) * PAGE_SIZE)}</b> of {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-line disabled:opacity-40">
                  <ChevronLeft size={15} />
                </button>
                <span className="tnum px-1">{page + 1} / {pageCount}</span>
                <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-line disabled:opacity-40">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {linkFor && <LinkDialog txn={linkFor} dataset={dataset} look={look} onClose={() => setLinkFor(null)} />}
    </div>
  );
}

/* ----------------------------------------------------------------- bits */

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card pad={false} className="px-3.5 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-grey">{label}</div>
      <div className="tnum mt-0.5 font-display text-[18px] font-extrabold leading-none" style={{ color }}>{value}</div>
    </Card>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`grid h-4 w-4 place-items-center rounded border ${checked ? 'border-brand bg-brand text-white' : 'border-line bg-white'}`}>
      {checked && <CheckSquare size={10} strokeWidth={3} />}
    </button>
  );
}

function Th({ label, k, sort, onSort, align = 'left' }: { label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void; align?: 'left' | 'right' }) {
  const on = sort.key === k;
  return (
    <th onClick={() => onSort(k)} className={`cursor-pointer select-none px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide hover:text-slate text-${align}`}>
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        {on && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );
}

function TxnRow({ t, look, dataset, selected, onToggle, onEdit, onLink }: { t: Transaction; look: ReturnType<typeof buildLookups>; dataset: Dataset; selected: boolean; onToggle: () => void; onEdit: () => void; onLink: () => void }) {
  const def = getTxnType(t.type);
  const dir = def?.direction ?? 'neutral';
  const sign = dir === 'in' ? '+' : dir === 'out' ? '−' : '';
  const amtColor = dir === 'in' ? MONEY.in : dir === 'out' ? MONEY.out : MONEY.transfer;
  const eventName = t.eventId ? dataset.events.find((e) => e.id === t.eventId)?.name : undefined;
  return (
    <tr className={`border-b border-line/70 transition-colors hover:bg-canvas ${selected ? 'bg-brand/[0.05]' : t.voided ? 'opacity-55' : ''}`}>
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onChange={onToggle} />
      </td>
      <td className="tnum whitespace-nowrap px-3 py-2 text-grey" onClick={onEdit} role="button">{fmtDate(t.date)}</td>
      <td className="px-3 py-2" onClick={onEdit} role="button">
        <div className={`font-semibold text-ink ${t.voided ? 'line-through' : ''}`}>{t.description || def?.label || 'Transaction'}</div>
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-grey">
          {t.personId && <span>{look.personName(t.personId)}</span>}
          {eventName && <Badge color={MONEY.net}>{eventName}</Badge>}
          {t.reimbursable && <Badge color={MONEY.reimb}>claimable</Badge>}
          {t.demo && <Badge color={MONEY.invest}>demo</Badge>}
          {t.status !== 'cleared' && <Badge color={MONEY.receivable}>{t.status}</Badge>}
        </div>
      </td>
      <td className="px-3 py-2" onClick={onEdit} role="button">
        {t.categoryId ? (
          <span className="inline-flex items-center gap-1.5 text-slate">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: look.catColor(t.categoryId) }} />
            {look.catName(t.categoryId)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate" onClick={onEdit} role="button">{t.accountId ? look.accName(t.accountId) : '—'}</td>
      <td className="px-3 py-2" onClick={onEdit} role="button">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: withAlpha(def?.color ?? '#64748B', 0.14), color: def?.color ?? '#64748B' }}>
          {def?.label ?? t.type}
        </span>
      </td>
      <td className="tnum whitespace-nowrap px-3 py-2 text-right font-bold" style={{ color: amtColor }} onClick={onEdit} role="button">{sign}{fmtINR(t.amountPaise)}</td>
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <RowMenu t={t} onEdit={onEdit} onLink={onLink} />
      </td>
    </tr>
  );
}

function RowMenu({ t, onEdit, onLink }: { t: Transaction; onEdit: () => void; onLink: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const Item = ({ icon: Icon, label, onClick, danger }: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) => (
    <button onClick={() => { setOpen(false); onClick(); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-canvas ${danger ? 'text-money-out' : 'text-slate'}`}>
      <Icon size={14} /> {label}
    </button>
  );
  async function duplicate() {
    const splits = await getSplits(t.id);
    const { id, createdAt, updatedAt, ...rest } = t;
    void id; void createdAt; void updatedAt;
    await addTransaction({ ...rest, description: t.description ? `${t.description} (copy)` : undefined }, splits.map((s) => ({ amountPaise: s.amountPaise, categoryId: s.categoryId, personId: s.personId, purposeId: s.purposeId, reimbursable: s.reimbursable })));
    toast('Transaction duplicated', { tone: 'success' });
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="grid h-7 w-7 place-items-center rounded-lg text-grey hover:bg-black/5"><MoreHorizontal size={16} /></button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-pop anim-fade">
          <Item icon={Pencil} label="Edit" onClick={onEdit} />
          <Item icon={Copy} label="Duplicate" onClick={duplicate} />
          <Item icon={Link2} label="Link to…" onClick={onLink} />
          {!t.voided && <Item icon={Ban} label="Void" onClick={async () => { await voidTransaction(t.id); toast('Voided', { actionLabel: 'Undo', onAction: () => updateTransaction(t.id, { voided: false }) }); }} />}
          <Item icon={Trash2} label="Delete" danger onClick={async () => { if (confirm('Delete permanently?')) { await deleteTransaction(t.id); toast('Deleted', { tone: 'error' }); } }} />
        </div>
      )}
    </div>
  );
}

function FilterBar({ dataset, look, filter, set, onClear }: { dataset: Dataset; look: ReturnType<typeof buildLookups>; filter: TxnFilter; set: <K extends keyof TxnFilter>(k: K, v: TxnFilter[K]) => void; onClear: () => void }) {
  const typeOpts: Option[] = listTxnTypes().map((t) => ({ value: t.id, label: t.label, color: t.color }));
  const catOpts: Option[] = dataset.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name, color: look.catColor(c.id) }));
  const purposeOpts: Option[] = dataset.purposes.map((p) => ({ value: p.id, label: p.name }));
  const personOpts: Option[] = dataset.people.map((p) => ({ value: p.id, label: p.name }));
  const accountOpts: Option[] = dataset.accounts.map((a) => ({ value: a.id, label: a.name }));
  const eventOpts: Option[] = dataset.events.map((e) => ({ value: e.id, label: e.name }));
  const tagOpts: Option[] = [...new Set(dataset.transactions.flatMap((t) => t.tags ?? []))].map((t) => ({ value: t, label: t }));
  const statusOpts: Option[] = [{ value: 'cleared', label: 'Cleared' }, { value: 'pending', label: 'Pending' }, { value: 'scheduled', label: 'Scheduled' }];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <MultiSelect label="Type" options={typeOpts} selected={filter.types} onChange={(v) => set('types', v)} />
      <MultiSelect label="Category" options={catOpts} selected={filter.categoryIds} onChange={(v) => set('categoryIds', v)} />
      <MultiSelect label="Account" options={accountOpts} selected={filter.accountIds} onChange={(v) => set('accountIds', v)} />
      <MultiSelect label="Person" options={personOpts} selected={filter.personIds} onChange={(v) => set('personIds', v)} />
      <MultiSelect label="Purpose" options={purposeOpts} selected={filter.purposeIds} onChange={(v) => set('purposeIds', v)} />
      {eventOpts.length > 0 && <MultiSelect label="Event" options={eventOpts} selected={filter.eventIds} onChange={(v) => set('eventIds', v)} />}
      {tagOpts.length > 0 && <MultiSelect label="Tag" options={tagOpts} selected={filter.tags} onChange={(v) => set('tags', v)} />}
      <MultiSelect label="Status" options={statusOpts} selected={filter.statuses} onChange={(v) => set('statuses', v as TxnStatus[])} />
      <div style={{ width: 150 }}>
        <Dropdown value={filter.reimb as string} options={[{ value: 'any', label: 'Any reimbursement' }, { value: 'reimbursable', label: 'Reimbursable' }, { value: 'not', label: 'Not reimbursable' }]} onChange={(v) => set('reimb', v as TxnFilter['reimb'])} size="sm" width="100%" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-28"><AmountField paise={filter.minPaise} onPaise={(p) => set('minPaise', p)} placeholder="min" /></div>
        <span className="text-grey">–</span>
        <div className="w-28"><AmountField paise={filter.maxPaise} onPaise={(p) => set('maxPaise', p)} placeholder="max" /></div>
      </div>
      <label className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate">
        <input type="checkbox" checked={filter.ignoreRange} onChange={(e) => set('ignoreRange', e.target.checked)} /> All time
      </label>
      <label className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate">
        <input type="checkbox" checked={filter.showVoided} onChange={(e) => set('showVoided', e.target.checked)} /> Show voided
      </label>
      <Button variant="ghost" size="sm" icon={X} onClick={onClear}>Clear all</Button>
    </div>
  );
}

function ActiveChips({ dataset, look, filter, set, onClear }: { dataset: Dataset; look: ReturnType<typeof buildLookups>; filter: TxnFilter; set: <K extends keyof TxnFilter>(k: K, v: TxnFilter[K]) => void; onClear: () => void }) {
  const chips: { label: string; onX: () => void }[] = [];
  if (filter.search.trim()) chips.push({ label: `"${filter.search}"`, onX: () => set('search', '') });
  filter.types.forEach((id) => chips.push({ label: getTxnType(id)?.label ?? id, onX: () => set('types', filter.types.filter((x) => x !== id)) }));
  filter.categoryIds.forEach((id) => chips.push({ label: look.catName(id), onX: () => set('categoryIds', filter.categoryIds.filter((x) => x !== id)) }));
  filter.accountIds.forEach((id) => chips.push({ label: look.accName(id), onX: () => set('accountIds', filter.accountIds.filter((x) => x !== id)) }));
  filter.personIds.forEach((id) => chips.push({ label: look.personName(id), onX: () => set('personIds', filter.personIds.filter((x) => x !== id)) }));
  filter.purposeIds.forEach((id) => chips.push({ label: look.purposeName(id), onX: () => set('purposeIds', filter.purposeIds.filter((x) => x !== id)) }));
  filter.eventIds.forEach((id) => chips.push({ label: dataset.events.find((e) => e.id === id)?.name ?? 'event', onX: () => set('eventIds', filter.eventIds.filter((x) => x !== id)) }));
  filter.tags.forEach((tg) => chips.push({ label: `#${tg}`, onX: () => set('tags', filter.tags.filter((x) => x !== tg)) }));
  filter.statuses.forEach((s) => chips.push({ label: s, onX: () => set('statuses', filter.statuses.filter((x) => x !== s)) }));
  if (filter.reimb !== 'any') chips.push({ label: filter.reimb === 'reimbursable' ? 'reimbursable' : 'not reimbursable', onX: () => set('reimb', 'any') });
  if (filter.minPaise != null) chips.push({ label: `≥ ${fmtINR(filter.minPaise)}`, onX: () => set('minPaise', null) });
  if (filter.maxPaise != null) chips.push({ label: `≤ ${fmtINR(filter.maxPaise)}`, onX: () => set('maxPaise', null) });
  if (filter.ignoreRange) chips.push({ label: 'all time', onX: () => set('ignoreRange', false) });
  if (filter.showVoided) chips.push({ label: 'incl. voided', onX: () => set('showVoided', false) });
  if (!chips.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11.5px] font-medium text-slate">
          {c.label}
          <button onClick={c.onX} className="text-muted hover:text-money-out"><X size={12} /></button>
        </span>
      ))}
      <button onClick={onClear} className="text-[11.5px] font-semibold text-money-out">Clear all</button>
    </div>
  );
}

function SavedFilters({ dataset, filter, onApply }: { dataset: Dataset; filter: TxnFilter; onApply: (f: TxnFilter) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const saved = dataset.settings?.savedTxnFilters ?? [];
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" icon={Bookmark} onClick={() => setOpen((o) => !o)}>Saved{saved.length ? ` · ${saved.length}` : ''}</Button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-56 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-pop anim-fade">
          {saved.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">No saved filters yet</div>}
          {saved.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-canvas">
              <button onClick={() => { onApply({ ...emptyFilter(), ...(s.filter as unknown as TxnFilter) }); setOpen(false); }} className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-slate">{s.name}</button>
              <button onClick={() => removeTxnFilter(s.id)} className="text-muted hover:text-money-out"><Trash2 size={13} /></button>
            </div>
          ))}
          <button
            onClick={async () => { const name = prompt('Save this filter as:'); if (name?.trim()) { await saveTxnFilter(name.trim(), filter as unknown as Record<string, unknown>); toast('Filter saved', { tone: 'success' }); } setOpen(false); }}
            className="mt-1 flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[12.5px] font-semibold text-brand hover:bg-canvas"
          >
            <Save size={14} /> Save current filter
          </button>
        </div>
      )}
    </div>
  );
}

function BulkBar({ dataset, count, ids, onDone }: { dataset: Dataset; count: number; ids: string[]; onDone: () => void }) {
  const catOpts: Option[] = dataset.categories.filter((c) => c.active && c.kind !== 'income').map((c) => ({ value: c.id, label: c.name }));
  const purposeOpts: Option[] = dataset.purposes.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));
  async function bulk(patch: Partial<Transaction>) {
    for (const id of ids) await updateTransaction(id, patch);
    toast(`Updated ${ids.length} transactions`, { tone: 'success' });
    onDone();
  }
  return (
    <Card pad={false} className="flex flex-wrap items-center gap-2 p-3">
      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink"><CheckSquare size={15} className="text-brand" /> {count} selected</span>
      <div style={{ width: 170 }}><Dropdown value="" options={catOpts} placeholder="Set category…" onChange={(v) => bulk({ categoryId: v })} size="sm" width="100%" /></div>
      <div style={{ width: 160 }}><Dropdown value="" options={purposeOpts} placeholder="Set purpose…" onChange={(v) => bulk({ purposeId: v })} size="sm" width="100%" /></div>
      <Button variant="outline" size="sm" onClick={async () => { const tag = prompt('Add tag to selected:'); if (tag?.trim()) { for (const id of ids) { const t = dataset.transactions.find((x) => x.id === id); await updateTransaction(id, { tags: [...new Set([...(t?.tags ?? []), tag.trim()])] }); } toast(`Tagged ${ids.length}`, { tone: 'success' }); onDone(); } }}>Add tag</Button>
      <Button variant="danger" size="sm" icon={Trash2} onClick={async () => { if (confirm(`Delete ${count} transactions permanently?`)) { for (const id of ids) await deleteTransaction(id); toast(`Deleted ${count}`, { tone: 'error' }); onDone(); } }}>Delete</Button>
      <Button variant="ghost" size="sm" onClick={onDone}>Clear selection</Button>
    </Card>
  );
}

function LinkDialog({ txn, dataset, look, onClose }: { txn: Transaction; dataset: Dataset; look: ReturnType<typeof buildLookups>; onClose: () => void }) {
  const [q, setQ] = useState('');
  const candidates = dataset.transactions
    .filter((t) => t.id !== txn.id && !t.voided)
    .filter((t) => {
      const hay = `${t.description ?? ''} ${look.personName(t.personId)} ${fmtINR(t.amountPaise)}`.toLowerCase();
      return !q.trim() || hay.includes(q.toLowerCase());
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 40);
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-pop animate-fade-up">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-display text-[15px] font-bold text-ink">Link to original</h3>
          <button onClick={onClose} className="text-grey hover:text-ink"><X size={18} /></button>
        </div>
        <div className="p-3">
          <p className="mb-2 text-[12px] text-grey">Match <b className="text-slate">{txn.description || getTxnType(txn.type)?.label}</b> to the transaction it relates to (e.g. a repayment to its loan, a refund to its purchase).</p>
          <TextField autoFocus value={q} placeholder="Search…" onChange={(e) => setQ(e.target.value)} />
          <div className="nice-scroll mt-2 max-h-72 overflow-auto">
            {candidates.map((t) => (
              <button
                key={t.id}
                onClick={async () => { await updateTransaction(txn.id, { linkedTxnId: t.id, reference: txn.reference || t.reference }); toast('Linked', { tone: 'success' }); onClose(); }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-canvas"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{t.description || getTxnType(t.type)?.label}</span>
                  <span className="block text-[11px] text-grey">{fmtDate(t.date)}{t.personId ? ` · ${look.personName(t.personId)}` : ''}</span>
                </span>
                <span className="tnum shrink-0 text-[12.5px] font-bold text-slate">{fmtINR(t.amountPaise)}</span>
              </button>
            ))}
            {candidates.length === 0 && <p className="py-6 text-center text-[12px] text-muted">No matches</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
