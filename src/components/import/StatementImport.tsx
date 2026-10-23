import { useMemo, useState } from 'react';
import { X, UploadCloud, ArrowRight, ArrowLeft, Check, AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import type { Dataset } from '../../db/hooks';
import type { ColumnMapping } from '../../db/types';
import { readStatementFile, fileToBase64 } from '../../lib/statementRead';
import { detectColumns, rowsToParsed } from '../../lib/statementParse';
import { reconcile, getTxnType, type ReconcileResult, type RowResult } from '../../engine';
import { addTransaction, saveAttachment, saveImportProfile } from '../../db/repo';
import { todayISO } from '../../db/ids';
import { MONEY } from '../../lib/brand';
import { fmtINR, fmtDate } from '../../lib/format';
import { toast } from '../../app/toast';
import { Card, Badge } from '../ui/Card';
import { Button, Dropdown, Segmented, Field, AmountField, TextField, Toggle, type Option } from '../ui/Controls';

type Step = 'upload' | 'map' | 'review';

const FIELD_LABELS: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount (single)' },
  { key: 'debit', label: 'Debit / withdrawal' },
  { key: 'credit', label: 'Credit / deposit' },
  { key: 'balance', label: 'Balance' },
  { key: 'reference', label: 'Reference' },
];

const TYPE_OPTS: Option[] = [
  { value: 'expense', label: 'Spent' },
  { value: 'income', label: 'Received' },
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'cc_purchase', label: 'Card purchase' },
  { value: 'cc_repayment', label: 'Card payment' },
];

export function StatementImport({ open, dataset, onClose }: { open: boolean; dataset: Dataset; onClose: () => void }) {
  const [step, setStep] = useState<Step>('upload');
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [raw, setRaw] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [amountMode, setAmountMode] = useState<'single' | 'debitCredit'>('debitCredit');
  const [prefer, setPrefer] = useState<'DMY' | 'MDY'>('DMY');
  const [openingPaise, setOpeningPaise] = useState<number | null>(null);
  const [closingPaise, setClosingPaise] = useState<number | null>(null);
  const [saveProfile, setSaveProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [keepFile, setKeepFile] = useState(false);
  const [recon, setRecon] = useState<ReconcileResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rowType, setRowType] = useState<Record<number, string>>({});

  const accountOpts: Option[] = dataset.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));
  const profilesForAccount = dataset.importProfiles.filter((p) => p.accountId === accountId);
  const headers = raw[headerRow] ?? [];
  const colOpts: Option[] = headers.map((h, i) => ({ value: String(i), label: h?.trim() ? `${h}` : `Column ${i + 1}` }));
  const dataRows = useMemo(() => raw.slice(headerRow + 1), [raw, headerRow]);

  function reset() {
    setStep('upload'); setFile(null); setRaw([]); setMapping({}); setRecon(null); setSelected(new Set()); setRowType({}); setOpeningPaise(null); setClosingPaise(null); setSaveProfile(false); setKeepFile(false);
  }
  function close() { reset(); onClose(); }

  async function onFile(f: File) {
    setFile(f);
    setBusy(true);
    try {
      const { rows } = await readStatementFile(f);
      setRaw(rows);
      // auto-detect the header row + mapping in the first ~12 rows
      let hr = 0;
      for (let i = 0; i < Math.min(12, rows.length); i++) {
        const d = detectColumns(rows[i] ?? []);
        if (d.mapping.date != null && (d.mapping.amount != null || (d.mapping.debit != null && d.mapping.credit != null))) { hr = i; break; }
      }
      setHeaderRow(hr);
      const det = detectColumns(rows[hr] ?? []);
      setMapping(det.mapping);
      setAmountMode(det.amountMode);
      const acc = dataset.accounts.find((a) => a.id === accountId);
      if (acc && openingPaise == null) setOpeningPaise(acc.openingBalancePaise);
      setStep('map');
    } catch (e) {
      toast(`Could not read file: ${String((e as Error).message ?? e)}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function loadProfile(id: string) {
    const p = dataset.importProfiles.find((x) => x.id === id);
    if (!p) return;
    setMapping(p.mapping);
    setAmountMode(p.amountMode);
    if (p.dateFormat === 'MDY') setPrefer('MDY');
    toast(`Loaded "${p.name}"`, { tone: 'success' });
  }

  function doReconcile() {
    const p = rowsToParsed(dataRows, mapping, amountMode, prefer);
    const existing = dataset.transactions.filter((t) => t.accountId === accountId);
    const r = reconcile(p, existing, { accountId, openingBalancePaise: openingPaise ?? undefined, closingBalancePaise: closingPaise ?? undefined });
    setRecon(r);
    const sel = new Set<number>();
    const types: Record<number, string> = {};
    r.results.forEach((res) => {
      if (res.status === 'new' && Math.abs(res.row.amountPaise) > 0) sel.add(res.index);
      types[res.index] = res.row.amountPaise >= 0 ? 'income' : 'expense';
    });
    setSelected(sel);
    setRowType(types);
    setStep('review');
  }

  async function doImport() {
    if (!recon) return;
    setBusy(true);
    try {
      let importId: string | undefined;
      let count = 0;
      for (const res of recon.results) {
        if (!selected.has(res.index)) continue;
        const r = res.row;
        if (Math.abs(r.amountPaise) === 0) continue; // skip balance-only lines
        const type = rowType[res.index] ?? (r.amountPaise >= 0 ? 'income' : 'expense');
        await addTransaction({
          type,
          amountPaise: Math.abs(r.amountPaise),
          date: r.date || todayISO(),
          accountId,
          description: r.description || undefined,
          reference: r.reference || undefined,
          status: 'cleared',
        });
        count++;
      }
      if (keepFile && file) {
        importId = `imp_${Date.now()}`;
        await saveAttachment({ importId, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, dataBase64: await fileToBase64(file) });
      }
      if (saveProfile && profileName.trim()) {
        await saveImportProfile({ name: profileName.trim(), accountId, mapping, amountMode, dateFormat: prefer });
      }
      toast(`Imported ${count} transaction${count === 1 ? '' : 's'}`, { tone: 'success' });
      close();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-canvas">
      <div className="flex items-center justify-between border-b border-line bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><UploadCloud size={17} /></span>
          <div>
            <h2 className="font-display text-[16px] font-extrabold leading-tight text-ink">Import a statement</h2>
            <p className="text-[11.5px] text-grey">Step {step === 'upload' ? '1' : step === 'map' ? '2' : '3'} of 3 · {step === 'upload' ? 'Upload' : step === 'map' ? 'Map columns' : 'Review & reconcile'}</p>
          </div>
        </div>
        <button onClick={close} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><X size={18} /></button>
      </div>

      <div className="nice-scroll mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {step === 'upload' && (
          <div className="space-y-4">
            <Card>
              <Field label="Which account is this statement for?" required>
                <Dropdown value={accountId} options={accountOpts} onChange={setAccountId} placeholder="Pick an account" width="100%" />
              </Field>
              {profilesForAccount.length > 0 && (
                <div className="mt-3 text-[12px] text-grey">Saved mappings: {profilesForAccount.map((p) => <button key={p.id} onClick={() => loadProfile(p.id)} className="mr-1.5 rounded-full border border-line px-2 py-0.5 font-semibold text-slate hover:border-brand/40">{p.name}</button>)}</div>
              )}
            </Card>
            <label className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-line bg-white py-14 text-center transition hover:border-brand/40 ${!accountId ? 'pointer-events-none opacity-50' : ''}`}>
              {busy ? <Loader2 className="animate-spin text-brand" size={28} /> : <UploadCloud size={30} className="text-brand" />}
              <p className="mt-3 font-display text-[15px] font-bold text-ink">{busy ? 'Reading…' : 'Drop a statement, or click to choose'}</p>
              <p className="mt-1 text-[12px] text-grey">CSV, XLSX or a text-based PDF. Nothing leaves your device.</p>
              <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" disabled={!accountId || busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            {!accountId && <p className="text-center text-[12px] text-money-out">Pick an account first.</p>}
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <Card>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Header row" hint="The row that holds column titles (rows above are skipped).">
                  <TextField type="number" min={0} value={String(headerRow)} onChange={(e) => setHeaderRow(Math.max(0, parseInt(e.target.value || '0', 10)))} />
                </Field>
                <Field label="Amount columns">
                  <Segmented value={amountMode} options={[{ value: 'debitCredit', label: 'Debit & Credit' }, { value: 'single', label: 'Single amount' }]} onChange={(v) => setAmountMode(v as 'single' | 'debitCredit')} />
                </Field>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FIELD_LABELS.filter((f) => (amountMode === 'single' ? f.key !== 'debit' && f.key !== 'credit' : f.key !== 'amount')).map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Dropdown value={mapping[f.key] != null ? String(mapping[f.key]) : ''} options={colOpts} onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === '' ? undefined : parseInt(v, 10) }))} placeholder="—" width="100%" size="sm" />
                  </Field>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Date format"><Segmented value={prefer} options={[{ value: 'DMY', label: 'DD/MM' }, { value: 'MDY', label: 'MM/DD' }]} onChange={(v) => setPrefer(v as 'DMY' | 'MDY')} size="sm" /></Field>
                <Field label="Opening balance" hint="For the running-balance check."><AmountField paise={openingPaise} onPaise={setOpeningPaise} /></Field>
                <Field label="Closing balance" hint="Optional."><AmountField paise={closingPaise} onPaise={setClosingPaise} /></Field>
              </div>
            </Card>

            <Card pad={false}>
              <div className="border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-grey">Preview — first rows</div>
              <div className="nice-scroll overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead><tr className="bg-canvas">{headers.map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-semibold text-slate">{h || `Col ${i + 1}`}</th>)}</tr></thead>
                  <tbody>{dataRows.slice(0, 6).map((r, ri) => <tr key={ri} className="border-b border-line/60">{headers.map((_, ci) => <td key={ci} className="whitespace-nowrap px-2 py-1 text-grey">{r[ci] ?? ''}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </Card>

            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" icon={ArrowLeft} onClick={() => setStep('upload')}>Back</Button>
              <Button icon={ArrowRight} disabled={mapping.date == null} onClick={doReconcile}>Preview &amp; reconcile</Button>
            </div>
          </div>
        )}

        {step === 'review' && recon && <Review recon={recon} selected={selected} setSelected={setSelected} rowType={rowType} setRowType={setRowType} dataset={dataset} onBack={() => setStep('map')} onImport={doImport} busy={busy} keepFile={keepFile} setKeepFile={setKeepFile} saveProfile={saveProfile} setSaveProfile={setSaveProfile} profileName={profileName} setProfileName={setProfileName} />}
      </div>
    </div>
  );
}

function Review({ recon, selected, setSelected, rowType, setRowType, dataset, onBack, onImport, busy, keepFile, setKeepFile, saveProfile, setSaveProfile, profileName, setProfileName }: {
  recon: ReconcileResult; selected: Set<number>; setSelected: (s: Set<number>) => void; rowType: Record<number, string>; setRowType: (r: Record<number, string>) => void; dataset: Dataset; onBack: () => void; onImport: () => void; busy: boolean; keepFile: boolean; setKeepFile: (v: boolean) => void; saveProfile: boolean; setSaveProfile: (v: boolean) => void; profileName: string; setProfileName: (v: string) => void;
}) {
  const { summary, balanceCheck, results } = recon;
  const toggle = (i: number) => { const n = new Set(selected); n.has(i) ? n.delete(i) : n.add(i); setSelected(n); };
  const STATUS: Record<RowResult['status'], { label: string; color: string }> = {
    matched: { label: 'Matched', color: MONEY.save },
    duplicate: { label: 'Duplicate', color: MONEY.receivable },
    new: { label: 'New', color: MONEY.in },
  };
  const matchName = (id?: string) => { const t = dataset.transactions.find((x) => x.id === id); return t ? `${t.description || getTxnType(t.type)?.label} · ${fmtDate(t.date)}` : ''; };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="New" value={summary.newCount} color={MONEY.in} />
        <Stat label="Matched" value={summary.matched} color={MONEY.save} />
        <Stat label="Duplicates" value={summary.duplicates} color={MONEY.receivable} />
        <Stat label="Balance issues" value={summary.balanceMismatches} color={summary.balanceMismatches ? MONEY.out : MONEY.transfer} />
      </div>

      {balanceCheck.ok != null && (
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] ${balanceCheck.ok ? 'border-money-save/30 bg-money-save/[0.06] text-money-save' : 'border-money-out/30 bg-money-out/[0.06] text-money-out'}`}>
          {balanceCheck.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {balanceCheck.ok
            ? `Running balance reconciles — computed closing ${fmtINR(balanceCheck.computedClosingPaise)} matches the statement.`
            : `Balance mismatch: computed closing ${fmtINR(balanceCheck.computedClosingPaise)} vs statement ${fmtINR(balanceCheck.statedClosingPaise)}. Check the opening balance and column mapping.`}
        </div>
      )}

      <Card pad={false}>
        <div className="nice-scroll max-h-[46vh] overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10"><tr className="bg-canvas text-[10.5px] font-bold uppercase tracking-wide text-grey"><th className="w-8 px-2 py-2" /><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2 text-left">Date</th><th className="px-2 py-2 text-left">Description</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2 text-left">Import as</th></tr></thead>
            <tbody>
              {results.map((res) => {
                const r = res.row;
                const on = selected.has(res.index);
                const st = STATUS[res.status];
                return (
                  <tr key={res.index} className={`border-b border-line/70 ${res.balanceOk === false ? 'bg-money-out/[0.04]' : ''}`}>
                    <td className="px-2 py-1.5"><button onClick={() => toggle(res.index)} className={`grid h-4 w-4 place-items-center rounded border ${on ? 'border-brand bg-brand text-white' : 'border-line'}`}>{on && <Check size={11} strokeWidth={3} />}</button></td>
                    <td className="px-2 py-1.5"><Badge color={st.color}>{st.label}</Badge>{res.status === 'matched' && <div className="text-[10px] text-grey">{matchName(res.matchTxnId)}</div>}</td>
                    <td className="tnum whitespace-nowrap px-2 py-1.5 text-grey">{r.date ? fmtDate(r.date) : '—'}</td>
                    <td className="px-2 py-1.5"><div className="max-w-[260px] truncate text-slate">{r.description || '—'}</div>{res.note && <div className="text-[10px] text-money-receivable">{res.note}</div>}</td>
                    <td className="tnum whitespace-nowrap px-2 py-1.5 text-right font-bold" style={{ color: r.amountPaise >= 0 ? MONEY.in : MONEY.out }}>{r.amountPaise >= 0 ? '+' : '−'}{fmtINR(Math.abs(r.amountPaise))}</td>
                    <td className="px-2 py-1.5"><div style={{ width: 130 }}><Dropdown value={rowType[res.index] ?? (r.amountPaise >= 0 ? 'income' : 'expense')} options={TYPE_OPTS} onChange={(v) => setRowType({ ...rowType, [res.index]: v })} size="sm" width="100%" /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Toggle checked={keepFile} onChange={setKeepFile} label="Keep a copy of this statement (in backup)" />
          <Toggle checked={saveProfile} onChange={setSaveProfile} label="Save this column mapping" color={MONEY.net} />
          {saveProfile && <div style={{ width: 200 }}><TextField value={profileName} placeholder="Mapping name" onChange={(e) => setProfileName(e.target.value)} /></div>}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-2 pb-4">
        <Button variant="outline" icon={ArrowLeft} onClick={onBack}>Back</Button>
        <Button icon={FileText} disabled={busy || selected.size === 0} onClick={onImport}>{busy ? 'Importing…' : `Import ${selected.size} selected`}</Button>
      </div>
      <p className="pb-4 text-center text-[11px] text-muted">Matched rows are left unchecked — they're already in your ledger. Nothing is imported until you confirm.</p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <Card pad={false} className="px-3.5 py-2.5"><div className="text-[11px] font-semibold uppercase tracking-wide text-grey">{label}</div><div className="tnum mt-0.5 font-display text-[20px] font-extrabold" style={{ color }}>{value}</div></Card>;
}
