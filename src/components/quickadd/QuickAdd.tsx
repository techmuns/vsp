import { useEffect, useMemo, useState } from 'react';
import { X, ChevronDown, Sparkles } from 'lucide-react';
import type { Dataset } from '../../db/hooks';
import type { QuickAddPrefill } from '../../app/context';
import { addTransaction, saveCategory, savePerson, savePurpose } from '../../db/repo';
import { getTxnType, listTxnTypes } from '../../engine';
import { MONEY, colorForId } from '../../lib/brand';
import { fmtINR } from '../../lib/format';
import { todayISO } from '../../db/ids';
import { AmountField, Button, DateField, Dropdown, Field, TextArea, TextField, Toggle, type Option } from '../ui/Controls';
import { CreatableSelect } from './CreatableSelect';
import { AccountCreateForm, InvestmentCreateForm } from './createForms';
import { SplitEditor, type SplitRow } from './SplitEditor';

const FRIENDLY: { id: string; label: string }[] = [
  { id: 'expense', label: 'Spent' },
  { id: 'income', label: 'Received' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'shared_expense', label: 'For someone' },
  { id: 'investment_buy', label: 'Invest' },
];

interface Draft {
  type: string;
  amountPaise: number | null;
  date: string;
  description: string;
  accountId: string;
  counterAccountId: string;
  categoryId: string;
  subcategoryId: string;
  purposeId: string;
  personId: string;
  investmentId: string;
  units: string;
  reimbursable: boolean;
  tags: string;
  eventId: string;
  notes: string;
  reference: string;
  theirSharePaise: number | null;
  splitMode: boolean;
  splits: SplitRow[];
}

function initialDraft(prefill?: QuickAddPrefill): Draft {
  return {
    type: prefill?.type ?? 'expense',
    amountPaise: null,
    date: todayISO(),
    description: '',
    accountId: prefill?.accountId ?? '',
    counterAccountId: '',
    categoryId: prefill?.categoryId ?? '',
    subcategoryId: '',
    purposeId: '',
    personId: prefill?.personId ?? '',
    investmentId: '',
    units: '',
    reimbursable: false,
    tags: '',
    eventId: '',
    notes: '',
    reference: '',
    theirSharePaise: null,
    splitMode: false,
    splits: [{ amountPaise: null }],
  };
}

export function QuickAdd({ open, prefill, onClose, dataset }: { open: boolean; prefill?: QuickAddPrefill; onClose: () => void; dataset: Dataset }) {
  const [d, setD] = useState<Draft>(() => initialDraft(prefill));
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setD(initialDraft(prefill));
      setShowMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const def = getTxnType(d.type);
  const fields = def?.fields ?? {};
  const isIncomeKind = d.type === 'income' || d.type === 'refund' || d.type === 'reimbursement_receipt';

  // option lists (active only)
  const accountOpts: Option[] = useMemo(
    () => dataset.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name, hint: a.institution, color: a.colorKey })),
    [dataset.accounts]
  );
  const categoryOpts: Option[] = useMemo(
    () =>
      dataset.categories
        .filter((c) => c.active && !c.parentId && (isIncomeKind ? c.kind !== 'expense' : c.kind !== 'income'))
        .map((c) => ({ value: c.id, label: c.name, color: c.colorKey ?? colorForId(c.id) })),
    [dataset.categories, isIncomeKind]
  );
  const subcategoryOpts: Option[] = useMemo(
    () => dataset.categories.filter((c) => c.active && c.parentId === d.categoryId).map((c) => ({ value: c.id, label: c.name })),
    [dataset.categories, d.categoryId]
  );
  const purposeOpts: Option[] = useMemo(() => dataset.purposes.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })), [dataset.purposes]);
  const personOpts: Option[] = useMemo(() => dataset.people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })), [dataset.people]);
  const investmentOpts: Option[] = useMemo(
    () => dataset.investments.filter((i) => i.active).map((i) => ({ value: i.id, label: i.name, hint: i.platform })),
    [dataset.investments]
  );
  const eventOpts: Option[] = useMemo(() => dataset.events.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name })), [dataset.events]);
  const advancedTypeOpts: Option[] = useMemo(
    () => listTxnTypes().map((t) => ({ value: t.id, label: t.label, color: t.color })),
    []
  );

  const amount = d.amountPaise ?? 0;
  const splitSum = d.splits.reduce((s, r) => s + (r.amountPaise ?? 0), 0);
  const splitRemainder = amount - splitSum;

  const canSave = (() => {
    if (!def || !d.amountPaise || d.amountPaise <= 0) return false;
    if (fields.account && !d.accountId) return false;
    if (fields.counter && !d.counterAccountId) return false;
    if (fields.investment && !d.investmentId) return false;
    if (d.type === 'shared_expense') {
      if (!d.personId || d.theirSharePaise == null) return false;
      if (d.theirSharePaise <= 0 || d.theirSharePaise >= amount) return false;
    }
    if ((def.fields?.person && d.type !== 'shared_expense') && !d.personId) return false;
    if (d.splitMode && splitRemainder !== 0) return false;
    return true;
  })();

  async function handleSave() {
    if (!canSave || !d.amountPaise) return;
    setSaving(true);
    try {
      const tags = d.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const base = {
        type: d.type,
        amountPaise: d.amountPaise,
        date: d.date,
        description: d.description || undefined,
        accountId: fields.account ? d.accountId || undefined : undefined,
        counterAccountId: fields.counter ? d.counterAccountId || undefined : undefined,
        categoryId: d.categoryId || undefined,
        subcategoryId: d.subcategoryId || undefined,
        purposeId: d.purposeId || undefined,
        personId: d.personId || undefined,
        investmentId: fields.investment ? d.investmentId || undefined : undefined,
        units: fields.investment && d.units ? parseFloat(d.units) : undefined,
        reimbursable: d.reimbursable || undefined,
        tags: tags.length ? tags : undefined,
        eventId: d.eventId || undefined,
        notes: d.notes || undefined,
        reference: d.reference || undefined,
      };

      let splits: SplitRow[] = [];
      if (d.splitMode) {
        splits = d.splits.filter((r) => r.amountPaise && r.amountPaise > 0);
      } else if (d.type === 'shared_expense' && d.theirSharePaise != null) {
        splits = [
          { amountPaise: d.theirSharePaise, personId: d.personId },
          { amountPaise: d.amountPaise - d.theirSharePaise, categoryId: d.categoryId || undefined },
        ];
      }

      await addTransaction(
        base,
        splits.map((s) => ({ amountPaise: s.amountPaise ?? 0, categoryId: s.categoryId, personId: s.personId, reimbursable: s.reimbursable }))
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const accentColor = def?.color ?? MONEY.net;

  const accountLabel = fields.counter ? 'From account' : def?.direction === 'in' ? 'To account' : 'Account';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white shadow-drawer animate-slide-in sm:w-[464px]">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${accentColor}18`, color: accentColor }}>
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="font-display text-[16px] font-extrabold leading-tight text-ink">Quick add</h2>
              <p className="text-[11.5px] text-grey">A few seconds is all it takes.</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5 focus-ring">
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="nice-scroll flex-1 overflow-y-auto px-5 py-4">
          {/* amount */}
          <div className="mb-4">
            <Field label="Amount" required>
              <AmountField paise={d.amountPaise} onPaise={(p) => set('amountPaise', p)} autoFocus big />
            </Field>
          </div>

          {/* friendly type picker */}
          <div className="mb-4">
            <span className="mb-1.5 block text-[11.5px] font-semibold text-slate">What happened?</span>
            <div className="flex flex-wrap gap-1.5">
              {FRIENDLY.map((t) => {
                const active = d.type === t.id;
                const color = getTxnType(t.id)?.color ?? MONEY.net;
                return (
                  <button
                    key={t.id}
                    onClick={() => set('type', t.id)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                      active ? 'border-transparent text-white shadow-sm' : 'border-line bg-white text-slate hover:border-brand/40'
                    }`}
                    style={active ? { background: color } : undefined}
                  >
                    {t.label}
                  </button>
                );
              })}
              {!FRIENDLY.some((t) => t.id === d.type) && (
                <span className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white" style={{ background: accentColor }}>
                  {def?.label}
                </span>
              )}
            </div>
          </div>

          {/* contextual fields */}
          <div className="space-y-3">
            {fields.account && (
              <Field label={accountLabel} required>
                <CreatableSelect
                  value={d.accountId}
                  onChange={(v) => set('accountId', v)}
                  options={accountOpts}
                  placeholder="Pick an account"
                  createNoun="account"
                  renderCreateForm={(p) => <AccountCreateForm {...p} />}
                />
              </Field>
            )}

            {fields.counter && (
              <Field label="To account" required>
                <CreatableSelect
                  value={d.counterAccountId}
                  onChange={(v) => set('counterAccountId', v)}
                  options={accountOpts.filter((o) => o.value !== d.accountId)}
                  placeholder="Pick an account"
                  createNoun="account"
                  renderCreateForm={(p) => <AccountCreateForm {...p} />}
                />
              </Field>
            )}

            {fields.investment && (
              <>
                <Field label="Investment" required>
                  <CreatableSelect
                    value={d.investmentId}
                    onChange={(v) => set('investmentId', v)}
                    options={investmentOpts}
                    placeholder="Pick an investment"
                    createNoun="investment"
                    renderCreateForm={(p) => <InvestmentCreateForm {...p} />}
                  />
                </Field>
                <Field label="Units" hint="Optional — helps value the holding later.">
                  <TextField inputMode="decimal" value={d.units} placeholder="e.g. 10" onChange={(e) => set('units', e.target.value.replace(/[^0-9.]/g, ''))} />
                </Field>
              </>
            )}

            {fields.person && (
              <Field label={d.type === 'shared_expense' ? 'Who did you pay for?' : 'Person'} required>
                <CreatableSelect value={d.personId} onChange={(v) => set('personId', v)} options={personOpts} placeholder="Pick a person" createNoun="person" onCreate={async (name) => (await savePerson({ name })).id} />
              </Field>
            )}

            {d.type === 'shared_expense' && (
              <Field label="Their share" required hint="The part they owe you back. The rest counts as your spend.">
                <AmountField paise={d.theirSharePaise} onPaise={(p) => set('theirSharePaise', p)} />
              </Field>
            )}

            {fields.category && !d.splitMode && (
              <Field label="Category">
                <CreatableSelect
                  value={d.categoryId}
                  onChange={(v) => set('categoryId', v)}
                  options={categoryOpts}
                  placeholder="Pick a category"
                  createNoun="category"
                  onCreate={async (name) => (await saveCategory({ name, kind: isIncomeKind ? 'income' : 'expense' })).id}
                />
              </Field>
            )}

            <Field label="Date">
              <DateField value={d.date} max={todayISO()} onChange={(e) => set('date', e.target.value)} />
            </Field>

            <Field label="Note">
              <TextField value={d.description} placeholder="What was it for?" onChange={(e) => set('description', e.target.value)} />
            </Field>
          </div>

          {/* more options */}
          <button
            onClick={() => setShowMore((s) => !s)}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-dashed border-line px-3 py-2 text-[12.5px] font-semibold text-slate transition hover:border-brand/40 focus-ring"
          >
            More options
            <ChevronDown size={16} className={`text-grey transition ${showMore ? 'rotate-180' : ''}`} />
          </button>

          {showMore && (
            <div className="mt-3 space-y-3 rounded-xl bg-canvas/60 p-3">
              <Field label="Transaction type" hint="Advanced types for cards, loans, reimbursements and more.">
                <Dropdown value={d.type} options={advancedTypeOpts} onChange={(v) => set('type', v)} width="100%" />
              </Field>

              {d.categoryId && subcategoryOpts.length > 0 && (
                <Field label="Subcategory">
                  <Dropdown value={d.subcategoryId} options={subcategoryOpts} onChange={(v) => set('subcategoryId', v)} placeholder="Optional" width="100%" />
                </Field>
              )}

              <Field label="Purpose">
                <CreatableSelect value={d.purposeId} onChange={(v) => set('purposeId', v)} options={purposeOpts} placeholder="Office / Personal…" createNoun="purpose" onCreate={async (name) => (await savePurpose({ name })).id} />
              </Field>

              {(def?.group === 'spend' || def?.group === 'card' || isIncomeKind) && (
                <div className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5">
                  <div>
                    <div className="text-[12.5px] font-semibold text-slate">{isIncomeKind ? 'This is a reimbursement' : 'Claim this back'}</div>
                    <div className="text-[11px] text-grey">{isIncomeKind ? 'Money coming back, not income.' : 'Reimbursable from employer / someone.'}</div>
                  </div>
                  <Toggle checked={d.reimbursable} onChange={(v) => set('reimbursable', v)} color={MONEY.reimb} />
                </div>
              )}

              {!d.type.startsWith('transfer') && (
                <div className="rounded-xl border border-line bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[12.5px] font-semibold text-slate">Split into parts</div>
                      <div className="text-[11px] text-grey">Across categories or people.</div>
                    </div>
                    <Toggle checked={d.splitMode} onChange={(v) => set('splitMode', v)} />
                  </div>
                  {d.splitMode && (
                    <SplitEditor
                      rows={d.splits}
                      categoryOpts={categoryOpts}
                      personOpts={personOpts}
                      remainder={splitRemainder}
                      onChange={(rows) => set('splits', rows)}
                    />
                  )}
                </div>
              )}

              <Field label="Tags" hint="Comma separated.">
                <TextField value={d.tags} placeholder="trip, emi…" onChange={(e) => set('tags', e.target.value)} />
              </Field>

              {eventOpts.length > 0 && (
                <Field label="Event">
                  <Dropdown value={d.eventId} options={eventOpts} onChange={(v) => set('eventId', v)} placeholder="Optional" width="100%" />
                </Field>
              )}

              <Field label="Reference">
                <TextField value={d.reference} placeholder="Invoice / UPI ref…" onChange={(e) => set('reference', e.target.value)} />
              </Field>

              <Field label="Notes">
                <TextArea value={d.notes} placeholder="Anything else to remember" onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-line px-5 py-3">
          {d.splitMode && splitRemainder !== 0 && (
            <p className="mb-2 text-center text-[11.5px] font-medium text-money-out">Split parts are off by {fmtINR(splitRemainder)} — they must add up to the amount.</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave || saving} className="flex-[2]" size="lg">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
