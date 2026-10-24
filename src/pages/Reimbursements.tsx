import { useMemo, useState } from 'react';
import { Receipt, Plus, Trash2, Power, Copy, FileDown, Printer, Check, ArrowRight, Wallet } from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { Snapshot } from '../engine';
import { buildClaimableLines, claimBatchTotal } from '../engine';
import type { ClaimStatus, ReimbursementClaim } from '../db/types';
import { resolveRange, startOfWeek, addDays, type DateRange } from '../lib/dates';
import { todayISO } from '../db/ids';
import { copyText } from '../lib/clipboard';
import { addTransaction, deleteClaim, removeEntity, saveClaim, savePolicy, setActive, updateClaim } from '../db/repo';
import { buildLookups } from '../app/lookups';
import { MONEY } from '../lib/brand';
import { fmtINR, fmtDate, fmtRange } from '../lib/format';
import { exportXlsx, printDocument, esc, type Row } from '../lib/exporters';
import { toast } from '../app/toast';
import { askConfirm } from '../app/confirm';
import { Card, PageHeader, CardHeader, Badge, EmptyState } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { Button, AmountField, DateField, Dropdown, Field, TextField, type Option } from '../components/ui/Controls';

type Tab = 'policies' | 'claimable' | 'claims' | 'settlement';

export default function Reimbursements({ dataset, snapshot }: { dataset: Dataset; snapshot: Snapshot; range: DateRange }) {
  const [tab, setTab] = useState<Tab>('claimable');
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        icon={Receipt}
        title="Reimbursements"
        subtitle="From eligible to received — kept distinct, nothing slips."
        accent={MONEY.reimb}
        right={
          <div className="hidden gap-3 sm:flex">
            <Mini label="Claimable (period)" value={fmtINR(snapshot.reimb.claimablePaise)} color={MONEY.reimb} />
            <Mini label="Pending" value={fmtINR(snapshot.reimb.outstandingPaise)} color={MONEY.receivable} />
          </div>
        }
      />
      <SubTabs
        tabs={[
          { key: 'claimable', label: 'Claimable', color: MONEY.reimb },
          { key: 'claims', label: 'Claims', color: MONEY.invest },
          { key: 'settlement', label: 'Settlement', color: MONEY.in },
          { key: 'policies', label: 'Policies', color: MONEY.transfer },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'policies' && <Policies dataset={dataset} />}
      {tab === 'claimable' && <Claimable dataset={dataset} />}
      {tab === 'claims' && <Claims dataset={dataset} />}
      {tab === 'settlement' && <Settlement dataset={dataset} />}
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-grey">{label}</div>
      <div className="tnum font-display text-[15px] font-extrabold" style={{ color }}>{value}</div>
    </div>
  );
}

/* --------------------------------------------------------------- policies */

function Policies({ dataset }: { dataset: Dataset }) {
  const [form, setForm] = useState<{ open: boolean; id?: string }>({ open: false });
  const look = buildLookups(dataset);
  return (
    <Card>
      <CardHeader icon={Receipt} title="Reimbursement policies" subtitle="Rules that set how much of a reimbursable expense you can claim back." accent={MONEY.reimb} right={<Button size="sm" icon={Plus} onClick={() => setForm({ open: true })}>Add policy</Button>} />
      {form.open && <PolicyForm dataset={dataset} id={form.id} onDone={() => setForm({ open: false })} />}
      {dataset.policies.length === 0 && !form.open ? (
        <EmptyState icon={Receipt} title="No policies yet" hint="e.g. ‘Office travel → 50% back, up to ₹2,000’." compact />
      ) : (
        <div className="mt-3 space-y-2">
          {dataset.policies.map((p) => {
            const match = p.matchPurposeId ? look.purposeName(p.matchPurposeId) : p.matchCategoryId ? look.catName(p.matchCategoryId) : 'any expense';
            const rule = `${p.percent != null ? `${p.percent}% back` : ''}${p.fixedPaise != null ? ` ${fmtINR(p.fixedPaise)} fixed` : ''}${p.maxPaise != null ? `, up to ${fmtINR(p.maxPaise)}` : ''}`;
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 ${p.active ? 'bg-white' : 'bg-canvas opacity-60'}`}>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-money-reimb/15 text-money-reimb"><Receipt size={15} /></span>
                <button onClick={() => setForm({ open: true, id: p.id })} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13px] font-semibold text-ink">{p.name}</div>
                  <div className="text-[11.5px] text-grey">On {match} → {rule || '100% back'}</div>
                </button>
                {p.demo && <Badge color={MONEY.invest}>demo</Badge>}
                <button onClick={() => setActive('reimbursementPolicies', p.id, !p.active)} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><Power size={15} className={p.active ? 'text-money-save' : 'text-muted'} /></button>
                <button onClick={async () => { if (await askConfirm({ title: 'Delete this policy?', danger: true, confirmLabel: 'Delete' })) { await removeEntity('reimbursementPolicies', p.id); toast('Policy deleted', { tone: 'error' }); } }} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:text-money-out"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PolicyForm({ dataset, id, onDone }: { dataset: Dataset; id?: string; onDone: () => void }) {
  const existing = id ? dataset.policies.find((p) => p.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [purposeId, setPurposeId] = useState(existing?.matchPurposeId ?? '');
  const [categoryId, setCategoryId] = useState(existing?.matchCategoryId ?? '');
  const [mode, setMode] = useState<'percent' | 'fixed'>(existing?.fixedPaise != null ? 'fixed' : 'percent');
  const [percent, setPercent] = useState(String(existing?.percent ?? 50));
  const [fixed, setFixed] = useState<number | null>(existing?.fixedPaise ?? null);
  const [cap, setCap] = useState<number | null>(existing?.maxPaise ?? null);
  const [validFrom, setValidFrom] = useState(existing?.validFrom ?? '');
  const [validTo, setValidTo] = useState(existing?.validTo ?? '');

  const purposeOpts: Option[] = dataset.purposes.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));
  const catOpts: Option[] = dataset.categories.filter((c) => c.active && c.kind !== 'income').map((c) => ({ value: c.id, label: c.name }));

  async function save() {
    await savePolicy({
      id,
      name: name.trim(),
      matchPurposeId: purposeId || undefined,
      matchCategoryId: categoryId || undefined,
      percent: mode === 'percent' && percent ? Math.max(0, Math.min(100, parseInt(percent, 10))) : undefined,
      fixedPaise: mode === 'fixed' ? fixed ?? undefined : undefined,
      maxPaise: cap ?? undefined,
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
      active: existing?.active ?? true,
    });
    toast(id ? 'Policy updated' : 'Policy added', { tone: 'success' });
    onDone();
  }

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.04] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Policy name" required><TextField autoFocus value={name} placeholder="e.g. Office travel" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Applies to purpose" hint="Blank = any purpose."><Dropdown value={purposeId} options={purposeOpts} onChange={setPurposeId} placeholder="Any purpose" width="100%" /></Field>
        <Field label="…and/or category" hint="Blank = any category."><Dropdown value={categoryId} options={catOpts} onChange={setCategoryId} placeholder="Any category" width="100%" /></Field>
        <Field label="How much back">
          <div className="flex items-center gap-2">
            <Dropdown value={mode} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed' }]} onChange={(v) => setMode(v as 'percent' | 'fixed')} width={110} size="sm" />
            {mode === 'percent' ? <TextField type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} className="w-24" /> : <AmountField paise={fixed} onPaise={setFixed} />}
          </div>
        </Field>
        <Field label="Cap per claim" hint="Optional maximum."><AmountField paise={cap} onPaise={setCap} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Valid from"><DateField value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></Field>
          <Field label="Valid to"><DateField value={validTo} onChange={(e) => setValidTo(e.target.value)} /></Field>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={!name.trim()} onClick={save}>{id ? 'Save changes' : 'Save policy'}</Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- claimable */

function Claimable({ dataset }: { dataset: Dataset }) {
  const salaryDay = dataset.settings?.salaryCycleStartDay ?? 11;
  const cycle = useMemo(() => resolveRange('salary_cycle', { today: todayISO(), salaryDay }), [salaryDay]);
  const [period, setPeriod] = useState<DateRange>(cycle);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const look = buildLookups(dataset);

  const lines = useMemo(() => buildClaimableLines({ transactions: dataset.transactions, splits: dataset.splits, policies: dataset.policies }, period), [dataset, period]);
  const total = claimBatchTotal(lines, { excludeIds: excluded, overrides });
  const includedIds = lines.filter((l) => !excluded.has(l.txnId)).map((l) => l.txnId);

  async function createClaim() {
    if (includedIds.length === 0 || total <= 0) return;
    await saveClaim({ periodStart: period.from, periodEnd: period.to, txnIds: includedIds, amountPaise: total, status: 'draft' });
    toast('Saved — find it under the Claims tab', { tone: 'success' });
    setExcluded(new Set());
    setOverrides({});
  }

  async function copyForHr() {
    if (includedIds.length === 0 || total <= 0) return;
    // Save it (marked submitted, since you're sending it now) and hand you the text.
    await saveClaim({ periodStart: period.from, periodEnd: period.to, txnIds: includedIds, amountPaise: total, status: 'submitted', submittedAt: Date.now() });
    const incl = lines.filter((l) => !excluded.has(l.txnId));
    const text =
      `Reimbursement claim — ${fmtDate(period.from)} to ${fmtDate(period.to)}\nTotal: ${fmtINR(total)}\n\n` +
      incl.map((l) => `• ${fmtDate(l.date)}  ${l.description || look.catName(l.categoryId)}  ${fmtINR(overrides[l.txnId] ?? l.claimablePaise)}`).join('\n');
    const ok = await copyText(text);
    if (ok) {
      toast('Copied! Paste it into your email or WhatsApp to HR.', { tone: 'success' });
    } else {
      const a = document.createElement('a');
      a.href = `mailto:?subject=${encodeURIComponent('Reimbursement claim')}&body=${encodeURIComponent(text)}`;
      a.click();
      toast('Opening your email with the claim ready to send…', { tone: 'success' });
    }
    setExcluded(new Set());
    setOverrides({});
  }

  return (
    <Card>
      <CardHeader icon={Receipt} title="Claim from HR" subtitle="Pick the week, tick what to claim, then one tap — Copy for HR." accent={MONEY.reimb} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="soft" size="sm" onClick={() => setPeriod(resolveRange('this_week', { today: todayISO() }))}>This week</Button>
        <Button variant="soft" size="sm" onClick={() => { const mon = startOfWeek(todayISO()); setPeriod({ from: addDays(mon, -7), to: addDays(mon, -1) }); }}>Last week</Button>
        <Button variant="outline" size="sm" onClick={() => setPeriod(cycle)}>Salary cycle</Button>
        <span className="mx-1 hidden text-line sm:inline">|</span>
        <DateField value={period.from} max={period.to} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} />
        <span className="text-grey">–</span>
        <DateField value={period.to} min={period.from} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} />
      </div>

      {lines.length === 0 ? (
        <EmptyState icon={Receipt} title="Nothing claimable in this period" hint="Mark office expenses as reimbursable (and add a matching policy) to see them here." compact />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-line">
            {lines.map((l) => {
              const on = !excluded.has(l.txnId);
              const amt = overrides[l.txnId] ?? l.claimablePaise;
              return (
                <div key={l.txnId} className={`flex items-center gap-3 border-b border-line/70 px-3 py-2.5 last:border-0 ${on ? '' : 'opacity-45'}`}>
                  <button onClick={() => setExcluded((s) => { const n = new Set(s); n.has(l.txnId) ? n.delete(l.txnId) : n.add(l.txnId); return n; })} className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-brand bg-brand text-white' : 'border-line'}`}>{on && <Check size={11} strokeWidth={3} />}</button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-ink">{l.description || 'Expense'}</div>
                    <div className="text-[11px] text-grey">{fmtDate(l.date)} · {look.catName(l.categoryId)} · gross {fmtINR(l.grossPaise)}</div>
                  </div>
                  <div className="w-28 shrink-0">
                    <AmountField paise={amt} onPaise={(p) => setOverrides((o) => ({ ...o, [l.txnId]: p ?? 0 }))} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] text-grey">Claiming <b className="tnum text-ink">{includedIds.length}</b> of {lines.length} · total <b className="tnum text-money-reimb">{fmtINR(total)}</b></div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" icon={Plus} disabled={includedIds.length === 0 || total <= 0} onClick={createClaim}>Just save</Button>
              <Button icon={Copy} disabled={includedIds.length === 0 || total <= 0} onClick={copyForHr}>Copy for HR</Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- claims */

const STATUS_META: Record<ClaimStatus, { label: string; color: string }> = {
  draft: { label: 'Ready', color: '#64748B' },
  submitted: { label: 'Submitted', color: MONEY.reimb },
  approved: { label: 'Approved', color: MONEY.invest },
  received: { label: 'Received', color: MONEY.save },
  rejected: { label: 'Rejected', color: MONEY.out },
  cancelled: { label: 'Cancelled', color: '#94A3B8' },
};

function Claims({ dataset }: { dataset: Dataset }) {
  const look = buildLookups(dataset);
  const claims = [...dataset.claims].sort((a, b) => b.createdAt - a.createdAt);
  const [receiptFor, setReceiptFor] = useState<ReimbursementClaim | null>(null);

  async function copySummary(c: ReimbursementClaim) {
    const lines = c.txnIds.map((id) => dataset.transactions.find((t) => t.id === id)).filter(Boolean);
    const text = `Reimbursement claim — ${fmtDate(c.periodStart)} to ${fmtDate(c.periodEnd)}\nTotal: ${fmtINR(c.amountPaise)}\n\n${lines.map((t) => `• ${fmtDate(t!.date)}  ${t!.description || look.catName(t!.categoryId)}  ${fmtINR(t!.amountPaise)}`).join('\n')}`;
    const ok = await copyText(text);
    toast(ok ? 'Summary copied — paste it to HR' : 'Could not copy — try Export or Print instead', { tone: ok ? 'success' : 'error' });
  }
  function exportClaim(c: ReimbursementClaim) {
    const rows: Row[] = c.txnIds.map((id) => { const t = dataset.transactions.find((x) => x.id === id); return { Date: t?.date ?? '', Expense: t?.description ?? '', Category: t ? look.catName(t.categoryId) : '', 'Amount (₹)': (t?.amountPaise ?? 0) / 100 }; });
    exportXlsx(`kosh-claim-${c.periodStart}`, 'Claim', rows);
    toast('Claim exported', { tone: 'success' });
  }
  function printClaim(c: ReimbursementClaim) {
    const body = `<h1>Reimbursement claim</h1><div class="sub">${esc(fmtRange(c.periodStart, c.periodEnd))} · Total ${esc(fmtINR(c.amountPaise))}</div>
      <table><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>
      ${c.txnIds.map((id) => { const t = dataset.transactions.find((x) => x.id === id); return `<tr><td>${esc(fmtDate(t?.date ?? ''))}</td><td>${esc(t?.description ?? '')}</td><td>${esc(t ? look.catName(t.categoryId) : '')}</td><td class="r">${esc(fmtINR(t?.amountPaise ?? 0))}</td></tr>`; }).join('')}
      <tr class="tot"><td colspan="3" class="r">Total claimed</td><td class="r">${esc(fmtINR(c.amountPaise))}</td></tr></tbody></table>`;
    printDocument('Reimbursement claim', body);
  }

  if (claims.length === 0) return <Card><EmptyState icon={Receipt} title="No claims yet" hint="Build a claim batch from the Claimable tab." /></Card>;

  return (
    <div className="space-y-3">
      {claims.map((c) => {
        const received = c.receivedPaise ?? 0;
        const derived = c.status === 'received' || (c.status === 'approved' && received > 0) ? (received >= c.amountPaise ? 'Fully received' : `Partially received (${fmtINR(received)})`) : STATUS_META[c.status].label;
        const meta = STATUS_META[c.status];
        return (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-[15px] font-bold text-ink">{fmtRange(c.periodStart, c.periodEnd)}</span>
                  <Badge color={meta.color} soft={false}>{derived}</Badge>
                </div>
                <div className="tnum mt-0.5 text-[13px] text-grey">Claimed <b className="text-money-reimb">{fmtINR(c.amountPaise)}</b> · {c.txnIds.length} items{received > 0 ? ` · received ${fmtINR(received)}` : ''}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Dropdown value={c.status} options={(Object.keys(STATUS_META) as ClaimStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label }))} onChange={(v) => updateClaim(c.id, { status: v as ClaimStatus, submittedAt: v === 'submitted' ? Date.now() : c.submittedAt })} size="sm" width={140} />
                {(c.status === 'approved' || c.status === 'submitted') && <Button size="sm" icon={Wallet} onClick={() => setReceiptFor(c)}>Record receipt</Button>}
                <button onClick={() => copySummary(c)} title="Copy summary" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-grey hover:border-brand/40"><Copy size={14} /></button>
                <button onClick={() => exportClaim(c)} title="Export" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-grey hover:border-brand/40"><FileDown size={14} /></button>
                <button onClick={() => printClaim(c)} title="Print" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-grey hover:border-brand/40"><Printer size={14} /></button>
                <button onClick={async () => { if (await askConfirm({ title: 'Delete this claim?', message: 'The expenses themselves stay.', danger: true, confirmLabel: 'Delete' })) { await deleteClaim(c.id); toast('Claim deleted', { tone: 'error' }); } }} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-grey hover:text-money-out"><Trash2 size={14} /></button>
              </div>
            </div>
          </Card>
        );
      })}
      {receiptFor && <ReceiptDialog claim={receiptFor} dataset={dataset} onClose={() => setReceiptFor(null)} />}
    </div>
  );
}

function ReceiptDialog({ claim, dataset, onClose }: { claim: ReimbursementClaim; dataset: Dataset; onClose: () => void }) {
  const remaining = claim.amountPaise - (claim.receivedPaise ?? 0);
  const [amount, setAmount] = useState<number | null>(remaining);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const accountOpts: Option[] = dataset.accounts.filter((a) => a.active && (a.type === 'bank' || a.type === 'cash')).map((a) => ({ value: a.id, label: a.name }));

  async function save() {
    if (!amount || amount <= 0 || !accountId) return;
    setBusy(true);
    try {
      await addTransaction({ type: 'reimbursement_receipt', amountPaise: amount, date, accountId, description: 'Reimbursement received' });
      const newReceived = (claim.receivedPaise ?? 0) + amount;
      await updateClaim(claim.id, { receivedPaise: newReceived, status: newReceived >= claim.amountPaise ? 'received' : 'approved' });
      toast('Receipt recorded', { tone: 'success' });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-pop animate-fade-up">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h3 className="font-display text-[15px] font-bold text-ink">Record reimbursement</h3><button onClick={onClose} className="text-[18px] leading-none text-grey hover:text-ink">×</button></div>
        <div className="space-y-3 p-4">
          <p className="text-[12.5px] text-grey">{fmtINR(remaining)} outstanding on this claim. Recording a receipt reduces what you’re owed — it is not counted as income.</p>
          <Field label="Amount received"><AmountField paise={amount} onPaise={setAmount} /></Field>
          <Field label="Into account" required><Dropdown value={accountId} options={accountOpts} onChange={setAccountId} placeholder="Pick an account" width="100%" /></Field>
          <Field label="Date"><DateField value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <div className="flex gap-2 pt-1"><Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button><Button onClick={save} disabled={!amount || !accountId || busy} className="flex-[2]">Record</Button></div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- settlement */

function Settlement({ dataset }: { dataset: Dataset }) {
  const [total, setTotal] = useState<number | null>(null);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [salaryPaise, setSalaryPaise] = useState<number | null>(null);
  const [salaryCat, setSalaryCat] = useState('');
  const [otherPaise, setOtherPaise] = useState<number | null>(null);
  const [claimAlloc, setClaimAlloc] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const accountOpts: Option[] = dataset.accounts.filter((a) => a.active && (a.type === 'bank' || a.type === 'cash')).map((a) => ({ value: a.id, label: a.name }));
  const incomeCats: Option[] = dataset.categories.filter((c) => c.active && c.kind !== 'expense').map((c) => ({ value: c.id, label: c.name }));
  const openClaims = dataset.claims.filter((c) => c.status !== 'received' && c.status !== 'cancelled' && c.status !== 'rejected');

  const allocated = (salaryPaise ?? 0) + (otherPaise ?? 0) + Object.values(claimAlloc).reduce((s, x) => s + x, 0);
  const diff = (total ?? 0) - allocated;
  const canSave = !!total && total > 0 && !!accountId && diff === 0;

  async function save() {
    if (!canSave || !total) return;
    setBusy(true);
    try {
      const splits: Array<{ amountPaise: number; categoryId?: string; reimbursable?: boolean }> = [];
      if (salaryPaise && salaryPaise > 0) splits.push({ amountPaise: salaryPaise, categoryId: salaryCat || undefined });
      for (const [, amt] of Object.entries(claimAlloc)) if (amt > 0) splits.push({ amountPaise: amt, reimbursable: true });
      if (otherPaise && otherPaise > 0) splits.push({ amountPaise: otherPaise });
      // Guard: splits must equal the credit (they do, since diff===0).
      await addTransaction({ type: 'income', amountPaise: total, date, accountId, description: 'Salary + reimbursement credit' }, splits);
      for (const [claimId, amt] of Object.entries(claimAlloc)) {
        if (amt <= 0) continue;
        const c = dataset.claims.find((x) => x.id === claimId);
        if (!c) continue;
        const newReceived = (c.receivedPaise ?? 0) + amt;
        await updateClaim(claimId, { receivedPaise: newReceived, status: newReceived >= c.amountPaise ? 'received' : 'approved' });
      }
      toast('Credit split & recorded', { tone: 'success' });
      setTotal(null); setSalaryPaise(null); setOtherPaise(null); setClaimAlloc({});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader icon={Wallet} title="Split a bank credit" subtitle="Allocate one deposit across salary, reimbursements and other income — the reimbursement part is never counted as salary." accent={MONEY.in} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Total credit" required><AmountField paise={total} onPaise={setTotal} big /></Field>
        <Field label="Into account" required><Dropdown value={accountId} options={accountOpts} onChange={setAccountId} placeholder="Pick" width="100%" /></Field>
        <Field label="Date"><DateField value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-slate"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MONEY.in }} /> Salary / main income</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <AmountField paise={salaryPaise} onPaise={setSalaryPaise} />
            <Dropdown value={salaryCat} options={incomeCats} onChange={setSalaryCat} placeholder="Category (optional)" width="100%" />
          </div>
        </div>

        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-slate"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MONEY.reimb }} /> Reimbursement claims</div>
          {openClaims.length === 0 ? (
            <p className="text-[12px] text-muted">No open claims. Build one from the Claimable tab.</p>
          ) : (
            <div className="space-y-1.5">
              {openClaims.map((c) => {
                const remaining = c.amountPaise - (c.receivedPaise ?? 0);
                return (
                  <div key={c.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 text-[12px]"><span className="font-semibold text-slate">{fmtRange(c.periodStart, c.periodEnd)}</span> <span className="text-grey">· {fmtINR(remaining)} due</span></div>
                    <div className="w-28"><AmountField paise={claimAlloc[c.id] ?? null} onPaise={(p) => setClaimAlloc((a) => ({ ...a, [c.id]: p ?? 0 }))} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-slate"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MONEY.save }} /> Other income (optional)</div>
          <AmountField paise={otherPaise} onPaise={setOtherPaise} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className={`text-[13px] font-semibold ${diff === 0 ? 'text-money-save' : 'text-grey'}`}>
          Allocated <span className="tnum">{fmtINR(allocated)}</span> of <span className="tnum">{fmtINR(total ?? 0)}</span>{diff !== 0 ? ` · ${fmtINR(Math.abs(diff))} ${diff > 0 ? 'unallocated' : 'over'}` : ' · balanced'}
        </div>
        <Button onClick={save} disabled={!canSave || busy} iconRight={ArrowRight}>{busy ? 'Saving…' : 'Record credit'}</Button>
      </div>
    </Card>
  );
}
