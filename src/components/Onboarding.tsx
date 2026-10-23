import { useState } from 'react';
import { Lock, Sparkles, X } from 'lucide-react';
import type { AccountType } from '../db/types';
import { saveAccount, updateSettings } from '../db/repo';
import { nowTs, todayISO } from '../db/ids';
import { loadDemoData } from '../demo/generate';
import { BrandMark } from './Shell';
import { AmountField, Button, DateField, Dropdown, Field, TextField, type Option } from './ui/Controls';

const TYPES: Option<AccountType>[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'broker_cash', label: 'Broker' },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [startDate, setStartDate] = useState(todayISO());
  const [salaryDay, setSalaryDay] = useState('11');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [opening, setOpening] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const savePrefs = async () => {
    await updateSettings({
      startDate,
      salaryCycleStartDay: Math.max(1, Math.min(28, parseInt(salaryDay || '11', 10))),
      onboardedAt: nowTs(),
    });
  };

  const finish = async () => {
    setBusy(true);
    try {
      await savePrefs();
      if (name.trim()) {
        await saveAccount({ name: name.trim(), type, openingBalancePaise: opening ?? 0, openingDate: startDate });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const tryDemo = async () => {
    setBusy(true);
    try {
      await savePrefs();
      await loadDemoData();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    await savePrefs();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm anim-fade" onClick={skip} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-pop animate-fade-up">
        {/* header */}
        <div className="relative overflow-hidden bg-brand-gradient px-6 py-5 text-white">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
          <button onClick={skip} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/15">
            <X size={18} />
          </button>
          <div className="relative">
            <BrandMark />
            <h2 className="mt-3 font-display text-[20px] font-extrabold">Welcome to Kosh</h2>
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-white/85">
              <Lock size={13} /> Private &amp; local — your money never leaves this device.
            </p>
          </div>
        </div>

        {/* body */}
        <div className="nice-scroll max-h-[55vh] overflow-y-auto px-6 py-5">
          <p className="mb-4 text-[13px] leading-relaxed text-grey">
            A couple of quick defaults to get you going. You can change any of this later — or skip and dive straight in.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tracking starts">
              <DateField value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Salary lands on day" hint="Of each month.">
              <TextField type="number" min={1} max={28} value={salaryDay} onChange={(e) => setSalaryDay(e.target.value)} />
            </Field>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-canvas/60 p-4">
            <p className="mb-3 text-[12.5px] font-bold text-slate">Add your first account</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <TextField value={name} placeholder="e.g. Salary account" onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Type">
                <Dropdown value={type} options={TYPES} onChange={setType} width="100%" />
              </Field>
              <Field label="Current balance">
                <AmountField paise={opening} onPaise={setOpening} />
              </Field>
            </div>
            <p className="mt-2 text-[11px] text-muted">Optional — you can add accounts anytime from Settings or Quick add.</p>
          </div>
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={skip}>
            Skip for now
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" icon={Sparkles} disabled={busy} onClick={tryDemo}>
              Explore with demo
            </Button>
            <Button disabled={busy} onClick={finish}>
              {busy ? 'Setting up…' : 'Get started'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
