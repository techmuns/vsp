import { useEffect, useMemo, useState } from 'react';
import { X, Copy, Trash2, Ban, Pencil } from 'lucide-react';
import type { Dataset } from '../../db/hooks';
import type { Split, Transaction, TxnStatus } from '../../db/types';
import { addTransaction, deleteTransaction, saveCategory, saveEvent, savePerson, savePurpose, updateTransaction, voidTransaction } from '../../db/repo';
import { getTxnType, listTxnTypes } from '../../engine';
import { MONEY, colorForId } from '../../lib/brand';
import { fmtINR } from '../../lib/format';
import { todayISO } from '../../db/ids';
import { toast } from '../../app/toast';
import { askConfirm } from '../../app/confirm';
import { AmountField, Button, DateField, Dropdown, Field, TextArea, TextField, Toggle, type Option } from '../ui/Controls';
import { CreatableSelect } from '../quickadd/CreatableSelect';
import { AccountCreateForm, InvestmentCreateForm } from '../quickadd/createForms';
import { SplitEditor, type SplitRow } from '../quickadd/SplitEditor';
import type { EditorArg } from '../../app/context';

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
  reference: string;
  notes: string;
  status: TxnStatus;
  theirSharePaise: number | null;
  splitMode: boolean;
  splits: SplitRow[];
}

function fromTxn(txn: Transaction, splits: Split[]): Draft {
  return {
    type: txn.type,
    amountPaise: txn.amountPaise,
    date: txn.date,
    description: txn.description ?? '',
    accountId: txn.accountId ?? '',
    counterAccountId: txn.counterAccountId ?? '',
    categoryId: txn.categoryId ?? '',
    subcategoryId: txn.subcategoryId ?? '',
    purposeId: txn.purposeId ?? '',
    personId: txn.personId ?? '',
    investmentId: txn.investmentId ?? '',
    units: txn.units != null ? String(txn.units) : '',
    reimbursable: !!txn.reimbursable,
    tags: (txn.tags ?? []).join(', '),
    eventId: txn.eventId ?? '',
    reference: txn.reference ?? '',
    notes: txn.notes ?? '',
    status: txn.status,
    theirSharePaise: null,
    splitMode: splits.length > 0,
    splits: splits.length ? splits.map((s) => ({ amountPaise: s.amountPaise, categoryId: s.categoryId, personId: s.personId, reimbursable: s.reimbursable })) : [{ amountPaise: null }],
  };
}

function fromPrefill(prefill?: Partial<Transaction>): Draft {
  return {
    type: prefill?.type ?? 'expense',
    amountPaise: prefill?.amountPaise ?? null,
    date: prefill?.date ?? todayISO(),
    description: prefill?.description ?? '',
    accountId: prefill?.accountId ?? '',
    counterAccountId: prefill?.counterAccountId ?? '',
    categoryId: prefill?.categoryId ?? '',
    subcategoryId: '',
    purposeId: prefill?.purposeId ?? '',
    personId: prefill?.personId ?? '',
    investmentId: prefill?.investmentId ?? '',
    units: '',
    reimbursable: !!prefill?.reimbursable,
    tags: '',
    eventId: prefill?.eventId ?? '',
    reference: prefill?.reference ?? '',
    notes: '',
    status: 'cleared',
    theirSharePaise: null,
    splitMode: false,
    splits: [{ amountPaise: null }],
  };
}

const STATUS_OPTS: Option<TxnStatus>[] = [
  { value: 'cleared', label: 'Cleared' },
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
];

export function TxnEditor({ open, arg, dataset, onClose }: { open: boolean; arg: EditorArg; dataset: Dataset; onClose: () => void }) {
  const existing = arg.txnId ? dataset.transactions.find((t) => t.id === arg.txnId) : undefined;
  const existingSplits = useMemo(() => (arg.txnId ? dataset.splits.filter((s) => s.txnId === arg.txnId) : []), [arg.txnId, dataset.splits]);

  const [d, setD] = useState<Draft>(() => (existing ? fromTxn(existing, existingSplits) : fromPrefill(arg.prefill)));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setD(existing ? fromTxn(existing, existingSplits) : fromPrefill(arg.prefill));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, arg.txnId]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const def = getTxnType(d.type);
  const fields = def?.fields ?? {};
  const isIncomeKind = d.type === 'income' || d.type === 'refund' || d.type === 'reimbursement_receipt' || d.type === 'investment_dividend';
  const accentColor = def?.color ?? MONEY.net;

  const accountOpts: Option[] = useMemo(
    () => dataset.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name, hint: a.institution, color: a.colorKey })),
    [dataset.accounts]
  );
  const categoryOpts: Option[] = useMemo(
    () => dataset.categories.filter((c) => c.active && !c.parentId && (isIncomeKind ? c.kind !== 'expense' : c.kind !== 'income')).map((c) => ({ value: c.id, label: c.name, color: c.colorKey ?? colorForId(c.id) })),
    [dataset.categories, isIncomeKind]
  );
  const subcategoryOpts: Option[] = useMemo(() => dataset.categories.filter((c) => c.active && c.parentId === d.categoryId).map((c) => ({ value: c.id, label: c.name })), [dataset.categories, d.categoryId]);
  const purposeOpts: Option[] = useMemo(() => dataset.purposes.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })), [dataset.purposes]);
  const personOpts: Option[] = useMemo(() => dataset.people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })), [dataset.people]);
  const investmentOpts: Option[] = useMemo(() => dataset.investments.filter((i) => i.active).map((i) => ({ value: i.id, label: i.name, hint: i.platform })), [dataset.investments]);
  const eventOpts: Option[] = useMemo(() => dataset.events.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name })), [dataset.events]);
  const typeOpts: Option[] = useMemo(() => listTxnTypes().map((t) => ({ value: t.id, label: t.label, color: t.color })), []);

  const amount = d.amountPaise ?? 0;
  const splitSum = d.splits.reduce((s, r) => s + (r.amountPaise ?? 0), 0);
  const splitRemainder = amount - splitSum;

  const canSave = (() => {
    if (!def || !d.amountPaise || d.amountPaise <= 0) return false;
    if (fields.account && !d.accountId) return false;
    if (fields.counter && !d.counterAccountId) return false;
    if (fields.investment && !d.investmentId) return false;
    if (d.type === 'shared_expense' && !d.splitMode) {
      if (!d.personId || d.theirSharePaise == null || d.theirSharePaise <= 0 || d.theirSharePaise >= amount) return false;
    }
    if (def.fields?.person && d.type !== 'shared_expense' && !d.personId) return false;
    if (d.splitMode && splitRemainder !== 0) return false;
    return true;
  })();

  function buildBaseAndSplits() {
    const tags = d.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const base: Partial<Transaction> & { type: string; amountPaise: number } = {
      type: d.type,
      amountPaise: d.amountPaise!,
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
      reference: d.reference || undefined,
      notes: d.notes || undefined,
      status: d.status,
    };
    let splits: SplitRow[] = [];
    if (d.splitMode) splits = d.splits.filter((r) => r.amountPaise && r.amountPaise > 0);
    else if (d.type === 'shared_expense' && d.theirSharePaise != null)
      splits = [
        { amountPaise: d.theirSharePaise, personId: d.personId },
        { amountPaise: amount - d.theirSharePaise, categoryId: d.categoryId || undefined },
      ];
    return { base, splits: splits.map((s) => ({ amountPaise: s.amountPaise ?? 0, categoryId: s.categoryId, personId: s.personId, reimbursable: s.reimbursable })) };
  }

  async function handleSave(duplicate = false) {
    if (!canSave) return;
    setSaving(true);
    try {
      const { base, splits } = buildBaseAndSplits();
      if (existing && !duplicate) {
        await updateTransaction(existing.id, base, splits);
        toast('Transaction updated', { tone: 'success' });
      } else {
        await addTransaction(base, splits);
        toast(duplicate ? 'Transaction duplicated' : 'Transaction added', { tone: 'success' });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid() {
    if (!existing) return;
    const id = existing.id;
    await voidTransaction(id);
    onClose();
    toast('Transaction voided', { tone: 'default', actionLabel: 'Undo', onAction: () => updateTransaction(id, { voided: false }) });
  }

  async function handleDelete() {
    if (!existing) return;
    if (!(await askConfirm({ title: 'Delete permanently?', message: 'Voiding keeps it in history instead.', danger: true, confirmLabel: 'Delete' }))) return;
    await deleteTransaction(existing.id);
    onClose();
    toast('Transaction deleted', { tone: 'error' });
  }

  if (!open) return null;
  const accountLabel = fields.counter ? 'From account' : def?.direction === 'in' ? 'To account' : 'Account';

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white shadow-drawer animate-slide-in sm:w-[480px]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${accentColor}18`, color: accentColor }}>
              <Pencil size={16} />
            </span>
            <div>
              <h2 className="font-display text-[16px] font-extrabold leading-tight text-ink">{existing ? 'Edit transaction' : 'New transaction'}</h2>
              <p className="text-[11.5px] text-grey">{existing ? 'Changes update balances live.' : 'Full detail entry.'}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5 focus-ring">
            <X size={18} />
          </button>
        </div>

        <div className="nice-scroll flex-1 overflow-y-auto px-5 py-4">
          {existing?.voided && (
            <div className="mb-3 rounded-xl border border-money-out/30 bg-money-out/[0.05] px-3 py-2 text-[12px] font-medium text-money-out">
              This transaction is voided — it no longer affects your figures.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Dropdown value={d.type} options={typeOpts} onChange={(v) => set('type', v)} width="100%" />
            </Field>
            <Field label="Amount" required>
              <AmountField paise={d.amountPaise} onPaise={(p) => set('amountPaise', p)} />
            </Field>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <DateField value={d.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Status">
              <Dropdown value={d.status} options={STATUS_OPTS} onChange={(v) => set('status', v)} width="100%" />
            </Field>
          </div>

          <div className="mt-3 space-y-3">
            {fields.account && (
              <Field label={accountLabel} required>
                <CreatableSelect value={d.accountId} onChange={(v) => set('accountId', v)} options={accountOpts} placeholder="Pick an account" createNoun="account" renderCreateForm={(p) => <AccountCreateForm {...p} />} />
              </Field>
            )}
            {fields.counter && (
              <Field label="To account" required>
                <CreatableSelect value={d.counterAccountId} onChange={(v) => set('counterAccountId', v)} options={accountOpts.filter((o) => o.value !== d.accountId)} placeholder="Pick an account" createNoun="account" renderCreateForm={(p) => <AccountCreateForm {...p} />} />
              </Field>
            )}
            {fields.investment && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Investment" required>
                  <CreatableSelect value={d.investmentId} onChange={(v) => set('investmentId', v)} options={investmentOpts} placeholder="Pick" createNoun="investment" renderCreateForm={(p) => <InvestmentCreateForm {...p} />} />
                </Field>
                <Field label="Units" hint="Optional">
                  <TextField inputMode="decimal" value={d.units} placeholder="e.g. 10" onChange={(e) => set('units', e.target.value.replace(/[^0-9.]/g, ''))} />
                </Field>
              </div>
            )}
            {fields.person && (
              <Field label={d.type === 'shared_expense' ? 'Who did you pay for?' : 'Person'} required>
                <CreatableSelect value={d.personId} onChange={(v) => set('personId', v)} options={personOpts} placeholder="Pick a person" createNoun="person" onCreate={async (name) => (await savePerson({ name })).id} />
              </Field>
            )}
            {d.type === 'shared_expense' && !d.splitMode && (
              <Field label="Their share" required hint="The part they owe you back.">
                <AmountField paise={d.theirSharePaise} onPaise={(p) => set('theirSharePaise', p)} />
              </Field>
            )}

            <Field label="Description">
              <TextField value={d.description} placeholder="What was it for?" onChange={(e) => set('description', e.target.value)} />
            </Field>

            {fields.category && !d.splitMode && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category">
                  <CreatableSelect value={d.categoryId} onChange={(v) => set('categoryId', v)} options={categoryOpts} placeholder="Pick" createNoun="category" onCreate={async (name) => (await saveCategory({ name, kind: isIncomeKind ? 'income' : 'expense' })).id} />
                </Field>
                <Field label="Subcategory">
                  <Dropdown value={d.subcategoryId} options={subcategoryOpts} onChange={(v) => set('subcategoryId', v)} placeholder={subcategoryOpts.length ? 'Optional' : 'None'} width="100%" />
                </Field>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Purpose">
                <CreatableSelect value={d.purposeId} onChange={(v) => set('purposeId', v)} options={purposeOpts} placeholder="Office / Personal…" createNoun="purpose" onCreate={async (name) => (await savePurpose({ name })).id} />
              </Field>
              <Field label="Event">
                <CreatableSelect value={d.eventId} onChange={(v) => set('eventId', v)} options={eventOpts} placeholder="Optional" createNoun="event" onCreate={async (name) => (await saveEvent({ name })).id} />
              </Field>
            </div>

            {(def?.group === 'spend' || def?.group === 'card' || isIncomeKind) && (
              <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
                <div>
                  <div className="text-[12.5px] font-semibold text-slate">{isIncomeKind ? 'This is a reimbursement' : 'Claim this back'}</div>
                  <div className="text-[11px] text-grey">{isIncomeKind ? 'Money coming back, not income.' : 'Reimbursable from employer / someone.'}</div>
                </div>
                <Toggle checked={d.reimbursable} onChange={(v) => set('reimbursable', v)} color={MONEY.reimb} />
              </div>
            )}

            {!d.type.startsWith('transfer') && (
              <div className="rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12.5px] font-semibold text-slate">Split into parts</div>
                    <div className="text-[11px] text-grey">Across categories or people.</div>
                  </div>
                  <Toggle checked={d.splitMode} onChange={(v) => set('splitMode', v)} />
                </div>
                {d.splitMode && <SplitEditor rows={d.splits} categoryOpts={categoryOpts} personOpts={personOpts} remainder={splitRemainder} onChange={(rows) => set('splits', rows)} />}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tags" hint="Comma separated">
                <TextField value={d.tags} placeholder="trip, emi…" onChange={(e) => set('tags', e.target.value)} />
              </Field>
              <Field label="Reference">
                <TextField value={d.reference} placeholder="UPI / invoice ref" onChange={(e) => set('reference', e.target.value)} />
              </Field>
            </div>
            <Field label="Notes">
              <TextArea value={d.notes} placeholder="Anything else to remember" onChange={(e) => set('notes', e.target.value)} />
            </Field>

            {existing && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <Button variant="outline" size="sm" icon={Copy} onClick={() => handleSave(true)}>
                  Duplicate
                </Button>
                {!existing.voided && (
                  <Button variant="outline" size="sm" icon={Ban} onClick={handleVoid}>
                    Void
                  </Button>
                )}
                <Button variant="danger" size="sm" icon={Trash2} onClick={handleDelete}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-line px-5 py-3">
          {d.splitMode && splitRemainder !== 0 && (
            <p className="mb-2 text-center text-[11.5px] font-medium text-money-out">Split parts are off by {fmtINR(splitRemainder)}.</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={() => handleSave(false)} disabled={!canSave || saving} className="flex-[2]" size="lg">
              {saving ? 'Saving…' : existing ? 'Save changes' : 'Add transaction'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
