import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X, Check, Loader2, AlertTriangle, Wand2, Lock } from 'lucide-react';
import type { Dataset } from '../../db/hooks';
import { suggestCategories } from '../../app/ai';
import { updateTransaction } from '../../db/repo';
import { getTxnType } from '../../engine';
import { colorForId, MONEY } from '../../lib/brand';
import { fmtINR, fmtDate } from '../../lib/format';
import { toast } from '../../app/toast';
import { Card, EmptyState } from '../ui/Card';
import { Button, Dropdown, type Option } from '../ui/Controls';

type Phase = 'intro' | 'loading' | 'ready' | 'error';

// Only entries where a category makes sense.
const CATEGORISABLE = new Set(['expense', 'cc_purchase', 'cc_fee', 'shared_expense', 'income', 'refund']);
const MAX_BATCH = 40;

interface Row {
  id: string;
  date: string;
  description: string;
  amountPaise: number;
  categoryId: string;
  subId: string;
  purposeId: string;
  apply: boolean;
  suggText: string;
}

export function AiCategorize({ open, dataset, onClose }: { open: boolean; dataset: Dataset; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase('intro');
      setRows([]);
      setError('');
    }
  }, [open]);

  const uncategorised = useMemo(
    () =>
      dataset.transactions
        .filter((t) => !t.voided && !t.categoryId && CATEGORISABLE.has(t.type))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, MAX_BATCH),
    [dataset.transactions]
  );

  const topCats = useMemo(() => dataset.categories.filter((c) => c.active && !c.parentId), [dataset.categories]);
  const catOpts: Option[] = topCats.map((c) => ({ value: c.id, label: c.name, color: c.colorKey ?? colorForId(c.id) }));

  async function run() {
    setPhase('loading');
    setError('');
    try {
      const names = {
        categories: topCats.map((c) => c.name),
        subcategories: dataset.categories.filter((c) => c.active && c.parentId).map((c) => c.name),
        purposes: dataset.purposes.filter((p) => p.active).map((p) => p.name),
      };
      const sugg = await suggestCategories(
        uncategorised.map((t) => ({ description: t.description, amountPaise: t.amountPaise })),
        names
      );
      const low = (s: string) => s.trim().toLowerCase();
      const findCat = (name: string) => topCats.find((c) => low(c.name) === low(name));
      const findSub = (name: string, parentId?: string) =>
        dataset.categories.find((c) => c.parentId && (!parentId || c.parentId === parentId) && low(c.name) === low(name));
      const findPurpose = (name: string) => dataset.purposes.find((p) => low(p.name) === low(name));

      const next: Row[] = uncategorised.map((t, i) => {
        const s = sugg[i] ?? { category: '', subcategory: '', purpose: '' };
        const cat = s.category ? findCat(s.category) : undefined;
        const sub = s.subcategory ? findSub(s.subcategory, cat?.id) : undefined;
        const purpose = s.purpose ? findPurpose(s.purpose) : undefined;
        return {
          id: t.id,
          date: t.date,
          description: t.description || getTxnType(t.type)?.label || '—',
          amountPaise: t.amountPaise,
          categoryId: cat?.id ?? '',
          subId: sub?.id ?? '',
          purposeId: purpose?.id ?? '',
          apply: !!cat,
          suggText: [s.category, s.subcategory, s.purpose].filter(Boolean).join(' · '),
        };
      });
      setRows(next);
      setPhase('ready');
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setPhase('error');
    }
  }

  async function apply() {
    const chosen = rows.filter((r) => r.apply && r.categoryId);
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      for (const r of chosen) {
        await updateTransaction(r.id, { categoryId: r.categoryId, subcategoryId: r.subId || undefined, purposeId: r.purposeId || undefined });
      }
      toast(`Categorised ${chosen.length} ${chosen.length === 1 ? 'entry' : 'entries'}`, { tone: 'success' });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const selected = rows.filter((r) => r.apply && r.categoryId).length;

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-canvas">
      <div className="flex items-center justify-between border-b border-line bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${MONEY.invest}18`, color: MONEY.invest }}>
            <Sparkles size={17} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-extrabold leading-tight text-ink">Suggest categories</h2>
            <p className="text-[11.5px] text-grey">Review every suggestion — nothing is saved until you apply.</p>
          </div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><X size={18} /></button>
      </div>

      <div className="nice-scroll mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {uncategorised.length === 0 ? (
          <Card><EmptyState icon={Check} title="Everything is categorised" hint="There are no uncategorised entries to suggest for right now." /></Card>
        ) : phase === 'intro' ? (
          <Card>
            <div className="grid place-items-center py-8 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `${MONEY.invest}14`, color: MONEY.invest }}><Wand2 size={22} /></span>
              <p className="font-display text-[15px] font-bold text-ink">{uncategorised.length} {uncategorised.length === 1 ? 'entry needs' : 'entries need'} a category</p>
              <p className="mt-1 max-w-md text-[12.5px] leading-snug text-grey">
                Kosh will send only each description, its amount and your own category names to get suggestions back. You confirm what to apply.
              </p>
              <Button className="mt-4" icon={Sparkles} onClick={run}>Get suggestions</Button>
            </div>
          </Card>
        ) : phase === 'loading' ? (
          <Card><div className="grid place-items-center py-14"><Loader2 className="animate-spin text-brand" size={26} /><p className="mt-3 text-[13px] text-grey">Thinking it through…</p></div></Card>
        ) : phase === 'error' ? (
          <Card>
            <div className="grid place-items-center py-10 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-money-out/12 text-money-out"><AlertTriangle size={22} /></span>
              <p className="font-display text-[14.5px] font-bold text-ink">Couldn’t get suggestions</p>
              <p className="mt-1 max-w-md text-[12.5px] leading-snug text-grey">{error}</p>
              <p className="mt-1 text-[11.5px] text-muted">Your data is untouched. This feature needs the server-side AI to be configured.</p>
              <Button className="mt-4" variant="outline" onClick={run}>Try again</Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card pad={false}>
              <div className="nice-scroll max-h-[58vh] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 z-10"><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="w-8 px-2 py-2" /><th className="px-2 py-2 text-left">Entry</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2 text-left">Category</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id} className="border-b border-line/70">
                        <td className="px-2 py-1.5">
                          <button onClick={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, apply: !x.apply } : x)))} className={`grid h-4 w-4 place-items-center rounded border ${r.apply ? 'border-brand bg-brand text-white' : 'border-line'}`}>{r.apply && <Check size={11} strokeWidth={3} />}</button>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="max-w-[260px] truncate text-slate">{r.description}</div>
                          <div className="text-[10px] text-grey">{fmtDate(r.date)}{r.suggText ? ` · AI: ${r.suggText}` : ' · no confident match'}</div>
                        </td>
                        <td className="tnum whitespace-nowrap px-2 py-1.5 text-right font-semibold text-slate">{fmtINR(r.amountPaise)}</td>
                        <td className="px-2 py-1.5">
                          <div style={{ width: 170 }}>
                            <Dropdown value={r.categoryId} options={catOpts} onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, categoryId: v, apply: true } : x)))} placeholder="Choose…" size="sm" width="100%" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="flex items-center gap-1.5 text-[11px] text-muted"><Lock size={12} /> Suggestions only — applied when you confirm.</span>
              <Button icon={Check} disabled={busy || selected === 0} onClick={apply}>{busy ? 'Applying…' : `Apply ${selected} selected`}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
