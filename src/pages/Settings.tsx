import { useState } from 'react';
import {
  Settings as SettingsIcon,
  Landmark,
  Tag,
  Users,
  Briefcase,
  Receipt,
  Plus,
  Trash2,
  Power,
  Sparkles,
  AlertTriangle,
  UploadCloud,
  Repeat,
  Target,
  Bell,
  Download,
  Clock,
  CheckCircle2,
  Pencil,
} from 'lucide-react';
import type { Dataset } from '../db/hooks';
import { useApp } from '../app/context';
import type { AccountType, CategoryKind, Goal, NotificationPrefs, Recurring, RecurringMode } from '../db/types';
import {
  clearDemoData,
  confirmRecurring,
  exportBackup,
  inspectBackup,
  loadBackupFromFile,
  removeEntity,
  restoreBackup,
  saveAccount,
  saveCategory,
  saveGoal,
  savePerson,
  savePolicy,
  savePurpose,
  saveRecurring,
  setActive,
  updateSettings,
  wipeAll,
  type Backup,
  type RestoreSummary,
} from '../db/repo';
import { SCHEMA_VERSION } from '../db/db';
import { loadDemoData } from '../demo/generate';
import { describeSchedule, goalProgress, goalAllocationConflicts, getTxnType, type Snapshot } from '../engine';
import { accountIcon, accountColor } from '../app/lookups';
import { colorForId, MONEY } from '../lib/brand';
import { fmtINR, fmtDate } from '../lib/format';
import { todayISO } from '../db/ids';
import { toast } from '../app/toast';
import { askConfirm } from '../app/confirm';
import { Card, CardHeader, PageHeader, Badge, EmptyState } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { AmountField, Button, DateField, Dropdown, Field, MultiSelect, Segmented, TextField, Toggle, type Option } from '../components/ui/Controls';

type Section = 'prefs' | 'accounts' | 'categories' | 'people' | 'reimburse' | 'recurring' | 'goals' | 'alerts' | 'data';

export default function Settings({ dataset, snapshot }: { dataset: Dataset; snapshot: Snapshot | null }) {
  const [section, setSection] = useState<Section>('prefs');
  const tabs: { key: Section; label: string; color?: string }[] = [
    { key: 'prefs', label: 'Preferences', color: MONEY.net },
    { key: 'accounts', label: 'Accounts', color: MONEY.net },
    { key: 'categories', label: 'Categories', color: MONEY.out },
    { key: 'people', label: 'People & purposes', color: MONEY.receivable },
    { key: 'reimburse', label: 'Reimbursements', color: MONEY.reimb },
    { key: 'recurring', label: 'Recurring', color: MONEY.transfer },
    { key: 'goals', label: 'Goals', color: MONEY.save },
    { key: 'alerts', label: 'Notifications', color: MONEY.card },
    { key: 'data', label: 'Data', color: MONEY.invest },
  ];

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Everything here is yours to change — nothing is hardcoded." accent={MONEY.transfer} />
      <SubTabs tabs={tabs} active={section} onChange={setSection} />

      {section === 'prefs' && <Preferences dataset={dataset} />}
      {section === 'accounts' && <Accounts dataset={dataset} />}
      {section === 'categories' && <Categories dataset={dataset} />}
      {section === 'people' && <PeoplePurposes dataset={dataset} />}
      {section === 'reimburse' && <Reimbursements dataset={dataset} />}
      {section === 'recurring' && <RecurringSection dataset={dataset} />}
      {section === 'goals' && <GoalsSection dataset={dataset} snapshot={snapshot} />}
      {section === 'alerts' && <AlertsSection dataset={dataset} />}
      {section === 'data' && <DataSection dataset={dataset} />}
    </div>
  );
}

/* ----------------------------------------------------------- preferences */

function Preferences({ dataset }: { dataset: Dataset }) {
  const s = dataset.settings;
  const [salaryDay, setSalaryDay] = useState(String(s?.salaryCycleStartDay ?? 11));
  const [startDate, setStartDate] = useState(s?.startDate ?? '');

  return (
    <div className="space-y-4">
    <Card className="max-w-xl">
      <CardHeader icon={SettingsIcon} title="Your preferences" subtitle="These seed sensible defaults — change them anytime." accent={MONEY.net} />
      <div className="space-y-4">
        <Field label="Salary cycle starts on day" hint="Used for the ‘Salary cycle’ date range. Most Indian salaries land early in the month.">
          <div className="flex items-center gap-2">
            <TextField
              type="number"
              min={1}
              max={28}
              value={salaryDay}
              className="w-24"
              onChange={(e) => setSalaryDay(e.target.value)}
              onBlur={() => {
                const d = Math.max(1, Math.min(28, parseInt(salaryDay || '11', 10)));
                setSalaryDay(String(d));
                updateSettings({ salaryCycleStartDay: d });
              }}
            />
            <span className="text-[12.5px] text-grey">of each month</span>
          </div>
        </Field>
        <Field label="Tracking start date" hint="When your records begin.">
          <DateField
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (e.target.value) updateSettings({ startDate: e.target.value });
            }}
          />
        </Field>
        <Field label="Currency">
          <div className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] font-semibold text-slate">
            ₹ Indian Rupee (INR)
          </div>
        </Field>
      </div>
    </Card>
    <AiCard dataset={dataset} />
    </div>
  );
}

function AiCard({ dataset }: { dataset: Dataset }) {
  const on = dataset.settings?.aiEnabled ?? false;
  return (
    <Card className="max-w-xl">
      <CardHeader icon={Sparkles} title="AI category suggestions" subtitle="Off by default. When on, Kosh can suggest a category for entries that don’t have one." accent={MONEY.invest} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] leading-snug text-slate">
          Only the <span className="font-semibold">description</span>, the <span className="font-semibold">amount</span> and your own category names are ever sent —
          never account numbers, balances, people or references. Every suggestion is reviewed and accepted by you in a batch; nothing is written automatically.
        </p>
        <Toggle checked={on} onChange={(v) => updateSettings({ aiEnabled: v })} color={MONEY.invest} />
      </div>
      {on && <p className="mt-2 text-[11.5px] text-muted">Use “Suggest categories” on the Transactions page. If the server isn’t configured, suggestions just won’t load — your data stays put.</p>}
    </Card>
  );
}

/* -------------------------------------------------------------- accounts */

const ACCOUNT_TYPES: Option<AccountType>[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'broker_cash', label: 'Broker' },
  { value: 'other', label: 'Other' },
];

function Accounts({ dataset }: { dataset: Dataset }) {
  const [adding, setAdding] = useState(false);
  const accounts = [...dataset.accounts].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <Card>
      <CardHeader
        icon={Landmark}
        title="Accounts"
        subtitle="Banks, cash, cards and broker balances."
        accent={MONEY.net}
        right={<Button size="sm" icon={Plus} onClick={() => setAdding((a) => !a)}>Add account</Button>}
      />
      {adding && <AccountForm onDone={() => setAdding(false)} />}
      {accounts.length === 0 && !adding ? (
        <EmptyState icon={Landmark} title="No accounts yet" hint="Add your first bank, cash wallet or card." compact />
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {accounts.map((a) => {
            const Icon = accountIcon(a.type);
            const color = accountColor(a.type);
            return (
              <div key={a.id} className={`flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 ${a.active ? 'bg-white' : 'bg-canvas opacity-60'}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${color}18`, color }}>
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{a.name}</div>
                  <div className="text-[11.5px] text-grey">
                    {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label}
                    {a.institution ? ` · ${a.institution}` : ''} · opens {fmtINR(a.openingBalancePaise)}
                  </div>
                </div>
                {a.demo && <Badge color={MONEY.invest}>demo</Badge>}
                <button
                  title={a.active ? 'Deactivate' : 'Reactivate'}
                  onClick={() => setActive('accounts', a.id, !a.active)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"
                >
                  <Power size={15} className={a.active ? 'text-money-save' : 'text-muted'} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [institution, setInstitution] = useState('');
  const [opening, setOpening] = useState<number | null>(0);
  const [openingDate, setOpeningDate] = useState('');

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.04] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <TextField autoFocus value={name} placeholder="e.g. Salary account" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <Dropdown value={type} options={ACCOUNT_TYPES} onChange={setType} width="100%" />
        </Field>
        <Field label="Bank / issuer / broker">
          <TextField value={institution} placeholder="Optional" onChange={(e) => setInstitution(e.target.value)} />
        </Field>
        <Field label="Opening balance">
          <AmountField paise={opening} onPaise={setOpening} />
        </Field>
        <Field label="Opening date">
          <DateField value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={async () => {
            await saveAccount({
              name: name.trim(),
              type,
              institution: institution.trim() || undefined,
              openingBalancePaise: opening ?? 0,
              ...(openingDate ? { openingDate } : {}),
            });
            onDone();
          }}
        >
          Save account
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ categories */

function Categories({ dataset }: { dataset: Dataset }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CategoryColumn dataset={dataset} kind="expense" title="Spending categories" color={MONEY.out} />
      <CategoryColumn dataset={dataset} kind="income" title="Income categories" color={MONEY.in} />
    </div>
  );
}

function CategoryColumn({ dataset, kind, title, color }: { dataset: Dataset; kind: CategoryKind; title: string; color: string }) {
  const [name, setName] = useState('');
  const cats = dataset.categories.filter((c) => c.kind === kind && !c.parentId).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <Card>
      <CardHeader icon={Tag} title={title} accent={color} />
      <div className="mb-3 flex gap-2">
        <TextField
          value={name}
          placeholder={`Add a ${kind} category`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && name.trim()) {
              await saveCategory({ name: name.trim(), kind });
              setName('');
            }
          }}
        />
        <Button
          size="sm"
          icon={Plus}
          disabled={!name.trim()}
          onClick={async () => {
            await saveCategory({ name: name.trim(), kind });
            setName('');
          }}
        >
          Add
        </Button>
      </div>
      {cats.length === 0 ? (
        <EmptyState icon={Tag} title="None yet" hint="Add categories as you need them, or load demo data." compact />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <span
              key={c.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${c.active ? 'border-line bg-white text-slate' : 'border-line bg-canvas text-muted line-through'}`}
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.colorKey ?? colorForId(c.id) }} />
              {c.name}
              {c.demo && <span className="text-[9px] uppercase text-money-invest">demo</span>}
              <button onClick={() => setActive('categories', c.id, !c.active)} className="text-muted hover:text-money-out" title={c.active ? 'Deactivate' : 'Reactivate'}>
                <Power size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------- people & purposes */

function PeoplePurposes({ dataset }: { dataset: Dataset }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SimpleList
        title="People"
        icon={Users}
        color={MONEY.receivable}
        items={dataset.people}
        placeholder="Add a person"
        onAdd={(name) => savePerson({ name })}
        onToggle={(id, active) => setActive('people', id, active)}
      />
      <SimpleList
        title="Purposes"
        icon={Briefcase}
        color={MONEY.net}
        items={dataset.purposes}
        placeholder="Add a purpose (e.g. Office)"
        onAdd={(name) => savePurpose({ name })}
        onToggle={(id, active) => setActive('purposes', id, active)}
      />
    </div>
  );
}

function SimpleList({
  title,
  icon,
  color,
  items,
  placeholder,
  onAdd,
  onToggle,
}: {
  title: string;
  icon: typeof Users;
  color: string;
  items: { id: string; name: string; active: boolean; demo?: boolean }[];
  placeholder: string;
  onAdd: (name: string) => Promise<unknown>;
  onToggle: (id: string, active: boolean) => void;
}) {
  const [name, setName] = useState('');
  const sorted = [...items].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const add = async () => {
    if (name.trim()) {
      await onAdd(name.trim());
      setName('');
    }
  };
  return (
    <Card>
      <CardHeader icon={icon} title={title} accent={color} />
      <div className="mb-3 flex gap-2">
        <TextField value={name} placeholder={placeholder} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button size="sm" icon={Plus} disabled={!name.trim()} onClick={add}>
          Add
        </Button>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={icon} title="None yet" compact />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((it) => (
            <span
              key={it.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${it.active ? 'border-line bg-white text-slate' : 'border-line bg-canvas text-muted line-through'}`}
            >
              {it.name}
              {it.demo && <span className="text-[9px] uppercase text-money-invest">demo</span>}
              <button onClick={() => onToggle(it.id, !it.active)} className="text-muted hover:text-money-out">
                <Power size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------- reimbursements */

function Reimbursements({ dataset }: { dataset: Dataset }) {
  const [adding, setAdding] = useState(false);
  const policies = dataset.policies;
  return (
    <Card>
      <CardHeader
        icon={Receipt}
        title="Reimbursement policies"
        subtitle="Rules that decide how much of a reimbursable expense you can claim back."
        accent={MONEY.reimb}
        right={<Button size="sm" icon={Plus} onClick={() => setAdding((a) => !a)}>Add policy</Button>}
      />
      {adding && <PolicyForm dataset={dataset} onDone={() => setAdding(false)} />}
      {policies.length === 0 && !adding ? (
        <EmptyState icon={Receipt} title="No policies yet" hint="e.g. ‘Office travel — 50% back, up to ₹2,000’." compact />
      ) : (
        <div className="mt-3 space-y-2">
          {policies.map((p) => {
            const match = dataset.purposes.find((x) => x.id === p.matchPurposeId)?.name ?? dataset.categories.find((x) => x.id === p.matchCategoryId)?.name ?? 'Anything';
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 ${p.active ? 'bg-white' : 'bg-canvas opacity-60'}`}>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-money-reimb/15 text-money-reimb">
                  <Receipt size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{p.name}</div>
                  <div className="text-[11.5px] text-grey">
                    {match} · {p.percent != null ? `${p.percent}% back` : ''}
                    {p.fixedPaise != null ? ` ${fmtINR(p.fixedPaise)} fixed` : ''}
                    {p.maxPaise != null ? ` · cap ${fmtINR(p.maxPaise)}` : ''}
                  </div>
                </div>
                {p.demo && <Badge color={MONEY.invest}>demo</Badge>}
                <button onClick={() => setActive('reimbursementPolicies', p.id, !p.active)} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5">
                  <Power size={15} className={p.active ? 'text-money-save' : 'text-muted'} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PolicyForm({ dataset, onDone }: { dataset: Dataset; onDone: () => void }) {
  const [name, setName] = useState('');
  const [purposeId, setPurposeId] = useState('');
  const [percent, setPercent] = useState('50');
  const [cap, setCap] = useState<number | null>(null);
  const purposeOpts: Option[] = dataset.purposes.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.04] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Policy name" required>
          <TextField autoFocus value={name} placeholder="e.g. Office travel" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Applies to purpose" hint="Leave blank to match any purpose.">
          <Dropdown value={purposeId} options={purposeOpts} onChange={setPurposeId} placeholder="Any purpose" width="100%" />
        </Field>
        <Field label="Percent back">
          <TextField type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </Field>
        <Field label="Cap per claim" hint="Optional maximum.">
          <AmountField paise={cap} onPaise={setCap} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={async () => {
            await savePolicy({
              name: name.trim(),
              matchPurposeId: purposeId || undefined,
              percent: percent ? Math.max(0, Math.min(100, parseInt(percent, 10))) : undefined,
              maxPaise: cap ?? undefined,
            });
            onDone();
          }}
        >
          Save policy
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- recurring */

const RECURRING_TYPES: Option[] = ['expense', 'income', 'transfer', 'cc_repayment', 'investment_contribution'].map((id) => ({
  value: id,
  label: getTxnType(id)?.label ?? id,
}));

const MODE_OPTS: Option<RecurringMode>[] = [
  { value: 'reminder', label: 'Remind me' },
  { value: 'draft', label: 'Draft it' },
  { value: 'auto', label: 'Auto-add' },
];

const MODE_HINT: Record<RecurringMode, string> = {
  reminder: 'Just a heads-up in notifications — nothing is entered until you confirm.',
  draft: 'A prefilled entry waits for your one-tap confirmation.',
  auto: 'Added automatically on its date (you can still edit or delete it).',
};

const WEEKDAY_OPTS: Option[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ({ value: String(i), label: d }));

function ScheduleEditor({ schedule, onChange }: { schedule: string; onChange: (s: string) => void }) {
  const [kind, val] = schedule.split(':');
  const setKind = (k: string) => onChange(k === 'daily' ? 'daily' : k === 'weekly' ? 'weekly:1' : k === 'monthly' ? 'monthly:1' : k === 'yearly' ? 'yearly:01-01' : 'everyN:7');
  const freqOpts: Option[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'everyN', label: 'Every N days' },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Repeats"><Dropdown value={kind} options={freqOpts} onChange={setKind} width={150} /></Field>
      {kind === 'weekly' && <Field label="On"><Dropdown value={val ?? '1'} options={WEEKDAY_OPTS} onChange={(v) => onChange(`weekly:${v}`)} width={150} /></Field>}
      {kind === 'monthly' && <Field label="Day of month"><TextField type="number" min={1} max={31} value={val ?? '1'} className="w-24" onChange={(e) => onChange(`monthly:${Math.max(1, Math.min(31, parseInt(e.target.value || '1', 10)))}`)} /></Field>}
      {kind === 'yearly' && <Field label="On (MM-DD)"><TextField value={val ?? '01-01'} placeholder="01-01" className="w-28" onChange={(e) => onChange(`yearly:${e.target.value}`)} /></Field>}
      {kind === 'everyN' && <Field label="Every N days"><TextField type="number" min={1} value={val ?? '7'} className="w-24" onChange={(e) => onChange(`everyN:${Math.max(1, parseInt(e.target.value || '1', 10))}`)} /></Field>}
      <span className="pb-2 text-[12px] font-medium text-grey">{describeSchedule(schedule)}</span>
    </div>
  );
}

function RecurringSection({ dataset }: { dataset: Dataset }) {
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const items = [...dataset.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDate.localeCompare(b.nextDate));
  const today = todayISO();
  const nameOf = (id?: string) => dataset.accounts.find((a) => a.id === id)?.name;

  return (
    <Card>
      <CardHeader
        icon={Repeat}
        title="Recurring items"
        subtitle="Rent, salary, EMIs, SIPs — predicted ahead. A predicted item is never counted until you confirm it, or it’s matched when you import a statement."
        accent={MONEY.transfer}
        right={<Button size="sm" icon={Plus} onClick={() => setEditing('new')}>Add recurring</Button>}
      />
      {editing && <RecurringForm dataset={dataset} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      {items.length === 0 && !editing ? (
        <EmptyState icon={Repeat} title="No recurring items yet" hint="Add your rent or salary to see it predicted and reconciled." compact />
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((r) => {
            const due = r.active && r.nextDate <= today;
            const missed = r.active && r.nextDate < today;
            const t = r.template;
            return (
              <div key={r.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${r.active ? 'bg-white' : 'bg-canvas opacity-60'} ${missed ? 'border-money-out/40' : 'border-line'}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${MONEY.transfer}16`, color: MONEY.transfer }}>
                  <Repeat size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{t.description || getTxnType(t.type ?? '')?.label || 'Recurring'}</span>
                    {t.amountPaise != null && <span className="tnum text-[12.5px] font-bold text-slate">{fmtINR(t.amountPaise)}</span>}
                    {r.demo && <Badge color={MONEY.invest}>demo</Badge>}
                  </div>
                  <div className="text-[11.5px] text-grey">
                    {describeSchedule(r.schedule)} · next {fmtDate(r.nextDate)}
                    {nameOf(t.accountId) ? ` · ${nameOf(t.accountId)}` : ''}
                  </div>
                </div>
                <Badge color={missed ? MONEY.out : due ? MONEY.receivable : MONEY.net}>{missed ? 'Missed' : due ? 'Due' : MODE_OPTS.find((m) => m.value === r.mode)?.label}</Badge>
                {r.active && (due || missed) && (
                  <Button size="sm" variant="soft" icon={CheckCircle2} onClick={async () => { await confirmRecurring(r.id); toast('Added to your ledger', { tone: 'success' }); }}>Confirm</Button>
                )}
                <button onClick={() => setEditing(r)} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><Pencil size={14} /></button>
                <button onClick={() => saveRecurring({ ...r, active: !r.active })} title={r.active ? 'Pause' : 'Resume'} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><Power size={15} className={r.active ? 'text-money-save' : 'text-muted'} /></button>
                <button onClick={async () => { if (await askConfirm({ title: 'Delete recurring item?', message: 'Entries already added stay in your ledger.', danger: true, confirmLabel: 'Delete' })) { await removeEntity('recurring', r.id); toast('Deleted', { tone: 'error' }); } }} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RecurringForm({ dataset, initial, onDone }: { dataset: Dataset; initial?: Recurring; onDone: () => void }) {
  const t0 = initial?.template ?? {};
  const [type, setType] = useState<string>(t0.type ?? 'expense');
  const [desc, setDesc] = useState(t0.description ?? '');
  const [amount, setAmount] = useState<number | null>(t0.amountPaise ?? null);
  const [accountId, setAccountId] = useState(t0.accountId ?? '');
  const [mode, setMode] = useState<RecurringMode>(initial?.mode ?? 'reminder');
  const [schedule, setSchedule] = useState(initial?.schedule ?? 'monthly:1');
  const [nextDate, setNextDate] = useState(initial?.nextDate ?? todayISO());
  const accountOpts: Option[] = dataset.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));

  const save = async () => {
    await saveRecurring({
      ...(initial ?? {}),
      template: { ...t0, type, description: desc.trim() || undefined, amountPaise: amount ?? 0, accountId: accountId || undefined },
      schedule,
      mode,
      nextDate,
      active: initial?.active ?? true,
    });
    toast(initial ? 'Recurring item updated' : 'Recurring item added', { tone: 'success' });
    onDone();
  };

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.04] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What is it?" required><TextField autoFocus value={desc} placeholder="e.g. House rent" onChange={(e) => setDesc(e.target.value)} /></Field>
        <Field label="Kind"><Dropdown value={type} options={RECURRING_TYPES} onChange={setType} width="100%" /></Field>
        <Field label="Amount" required><AmountField paise={amount} onPaise={setAmount} /></Field>
        <Field label="Account"><Dropdown value={accountId} options={accountOpts} onChange={setAccountId} placeholder="Pick an account" width="100%" /></Field>
      </div>
      <div className="mt-3"><ScheduleEditor schedule={schedule} onChange={setSchedule} /></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Next date"><DateField value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></Field>
        <Field label="When it’s due" hint={MODE_HINT[mode]}><Segmented value={mode} options={MODE_OPTS} onChange={setMode} size="sm" /></Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={!desc.trim() || !amount} onClick={save}>{initial ? 'Save changes' : 'Add recurring'}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ goals */

function GoalsSection({ dataset, snapshot }: { dataset: Dataset; snapshot: Snapshot | null }) {
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const goals = [...dataset.goals].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const conflicts = goalAllocationConflicts(dataset.goals);
  const balOf = (id: string) => snapshot?.balances.find((b) => b.account.id === id)?.balancePaise ?? 0;
  const savedFor = (g: Goal) => (g.linkedAccountIds?.length ? g.linkedAccountIds.reduce((s, id) => s + Math.max(0, balOf(id)), 0) : g.savedPaise ?? 0);
  const start = dataset.settings?.startDate || undefined;
  const today = todayISO();

  return (
    <Card>
      <CardHeader
        icon={Target}
        title="Savings goals"
        subtitle="Set a target and watch the progress. Link the accounts that hold the money and progress updates itself."
        accent={MONEY.save}
        right={<Button size="sm" icon={Plus} onClick={() => setEditing('new')}>Add goal</Button>}
      />
      {conflicts.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-money-receivable/30 bg-money-receivable/[0.06] px-3 py-2 text-[12px] text-money-receivable">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          An account is linked to more than one goal, so the same money counts twice. Unlink it from all but one goal to keep progress honest.
        </div>
      )}
      {editing && <GoalForm dataset={dataset} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      {goals.length === 0 && !editing ? (
        <EmptyState icon={Target} title="No goals yet" hint="e.g. ‘Emergency fund — ₹3,00,000 by December’." compact />
      ) : (
        <div className="mt-3 space-y-3">
          {goals.map((g) => {
            const saved = savedFor(g);
            const p = goalProgress(g, { savedPaise: saved, startDate: start, today });
            return (
              <div key={g.id} className={`rounded-xl border px-3.5 py-3 ${g.active ? 'border-line bg-white' : 'border-line bg-canvas opacity-60'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{g.name}</span>
                    {g.demo && <Badge color={MONEY.invest}>demo</Badge>}
                    {p.onTrack != null && <Badge color={p.onTrack ? MONEY.save : MONEY.out}>{p.onTrack ? 'On track' : 'Behind'}</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(g)} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><Pencil size={14} /></button>
                    <button onClick={() => setActive('goals', g.id, !g.active)} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><Power size={15} className={g.active ? 'text-money-save' : 'text-muted'} /></button>
                    <button onClick={async () => { if (await askConfirm({ title: 'Delete this goal?', danger: true, confirmLabel: 'Delete' })) { await removeEntity('goals', g.id); toast('Deleted', { tone: 'error' }); } }} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, p.pct))}%`, background: MONEY.save }} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 text-[11.5px] text-grey">
                  <span><span className="tnum font-bold text-ink">{fmtINR(saved)}</span> of <span className="tnum">{fmtINR(g.targetPaise)}</span> · {Math.round(p.pct)}%</span>
                  <span>{p.remainingPaise > 0 ? <><span className="tnum">{fmtINR(p.remainingPaise)}</span> to go</> : 'Reached 🎉'}{g.targetDate ? ` · by ${fmtDate(g.targetDate)}` : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function GoalForm({ dataset, initial, onDone }: { dataset: Dataset; initial?: Goal; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState<number | null>(initial?.targetPaise ?? null);
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '');
  const [linked, setLinked] = useState<string[]>(initial?.linkedAccountIds ?? []);
  const [manualSaved, setManualSaved] = useState<number | null>(initial?.savedPaise ?? null);
  const accountOpts: Option[] = dataset.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));

  const save = async () => {
    await saveGoal({
      ...(initial ?? {}),
      name: name.trim(),
      targetPaise: target ?? 0,
      targetDate: targetDate || undefined,
      linkedAccountIds: linked.length ? linked : undefined,
      savedPaise: linked.length ? undefined : manualSaved ?? undefined,
      active: initial?.active ?? true,
    });
    toast(initial ? 'Goal updated' : 'Goal added', { tone: 'success' });
    onDone();
  };

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.04] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Goal name" required><TextField autoFocus value={name} placeholder="e.g. Emergency fund" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Target amount" required><AmountField paise={target} onPaise={setTarget} /></Field>
        <Field label="Target date" hint="Optional — enables on-track tracking."><DateField value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
        <Field label="Linked accounts" hint="Progress follows their balance. Leave empty to track by hand."><MultiSelect label={linked.length ? `${linked.length} linked` : 'Pick accounts'} options={accountOpts} selected={linked} onChange={setLinked} width="100%" /></Field>
        {linked.length === 0 && <Field label="Saved so far" hint="Set this yourself when no account is linked."><AmountField paise={manualSaved} onPaise={setManualSaved} /></Field>}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={!name.trim() || !target} onClick={save}>{initial ? 'Save changes' : 'Add goal'}</Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- notifications */

const PREF_ROWS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'bills', label: 'Upcoming & missed bills', hint: 'Recurring items due soon or that look missed.' },
  { key: 'cardDue', label: 'Credit-card balances', hint: 'When a card carries an outstanding balance.' },
  { key: 'receivables', label: 'Overdue money owed to you', hint: 'When someone is past their due date.' },
  { key: 'reimbursements', label: 'Pending reimbursements', hint: 'Claimable amounts not yet received.' },
  { key: 'weeklyClaim', label: 'Ready-to-claim reminder', hint: 'A nudge to file a claim batch.' },
  { key: 'missingDetails', label: 'Uncategorised entries', hint: 'Transactions still missing a category.' },
  { key: 'reconciliation', label: 'Reconciliation issues', hint: 'Statement mismatches found on import.' },
  { key: 'spendingLimit', label: 'Spending-limit alerts', hint: 'When spending passes the limit below.' },
];

const DEFAULT_PREFS: NotificationPrefs = { bills: true, cardDue: true, receivables: true, reimbursements: true, weeklyClaim: true, missingDetails: true, reconciliation: true, spendingLimit: true };

function AlertsSection({ dataset }: { dataset: Dataset }) {
  const prefs = dataset.settings?.notificationPrefs ?? DEFAULT_PREFS;
  const [limit, setLimit] = useState<number | null>(dataset.settings?.spendingLimitPaise ?? null);
  const setPref = (key: keyof NotificationPrefs, v: boolean) => updateSettings({ notificationPrefs: { ...prefs, [key]: v } });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={Bell} title="Notifications" subtitle="All quiet and in-dashboard — nothing is ever pushed, emailed or sent off this device." accent={MONEY.card} />
        <div className="divide-y divide-line">
          {PREF_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">{row.label}</div>
                <div className="text-[11.5px] text-grey">{row.hint}</div>
              </div>
              <Toggle checked={prefs[row.key]} onChange={(v) => setPref(row.key, v)} />
            </div>
          ))}
        </div>
      </Card>
      <Card className="max-w-md">
        <CardHeader icon={AlertTriangle} title="Monthly spending limit" subtitle="Optional. You’ll get an alert when spending in the current range passes this." accent={MONEY.out} />
        <div className="flex items-end gap-2">
          <div className="flex-1"><AmountField paise={limit} onPaise={setLimit} /></div>
          <Button variant="soft" onClick={() => { updateSettings({ spendingLimitPaise: limit ?? undefined }); toast('Saved', { tone: 'success' }); }}>Save</Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ data */

function BackupCard({ dataset }: { dataset: Dataset }) {
  const [busy, setBusy] = useState(false);
  const last = dataset.settings?.lastBackupAt;
  const stale = !last || Date.now() - last > 14 * 864e5;
  const download = async () => {
    setBusy(true);
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kosh-backup-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await updateSettings({ lastBackupAt: Date.now() });
      toast('Backup downloaded', { tone: 'success' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader icon={Download} title="Download a backup" subtitle="One JSON file with everything — accounts, transactions, settings and attachments. Keep it somewhere safe off this device." accent={MONEY.save} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`flex items-center gap-1.5 text-[12px] ${stale ? 'text-money-receivable' : 'text-grey'}`}>
          <Clock size={14} />
          {last ? `Last backup ${new Date(last).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'No backup yet'}
          {stale ? ' · a fresh one is a good idea' : ''}
        </div>
        <Button icon={Download} disabled={busy} onClick={download}>Download backup</Button>
      </div>
    </Card>
  );
}

function RestoreCard() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<unknown>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);

  const pick = async (f: File) => {
    setFile(f);
    try {
      const data = await loadBackupFromFile(f);
      setParsed(data);
      setSummary(inspectBackup(data));
    } catch (e) {
      setParsed(null);
      setSummary({ valid: false, error: String((e as Error).message ?? e), counts: {}, total: 0 });
    }
  };

  const run = async () => {
    if (!summary?.valid || !parsed) return;
    const detail = mode === 'replace'
      ? `REPLACE everything with ${summary.total} records from the backup. Anything not in the backup will be erased.`
      : `merge ${summary.total} records into your data. Records with the same id are updated; everything else is kept.`;
    if (!(await askConfirm({ title: 'Restore this backup?', message: `This will ${detail}`, confirmLabel: 'Restore', danger: mode === 'replace' }))) return;
    setBusy(true);
    try {
      await restoreBackup(parsed as Backup, mode);
      toast('Backup restored', { tone: 'success' });
      setFile(null);
      setParsed(null);
      setSummary(null);
    } catch (e) {
      toast(String((e as Error).message ?? e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={UploadCloud} title="Restore from a backup" subtitle="Bring your data back on a new device or after clearing your browser. You choose how it’s applied — nothing is overwritten without confirmation." accent={MONEY.net} />
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-canvas py-4 text-[12.5px] font-semibold text-slate transition hover:border-brand/40">
        <UploadCloud size={16} /> {file ? file.name : 'Choose a Kosh backup (.json)'}
        <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>
      {summary && !summary.valid && <p className="mt-2 text-[12px] font-semibold text-money-out">{summary.error}</p>}
      {summary?.valid && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-line bg-canvas px-3 py-2 text-[12px] text-slate">
            <span className="tnum font-bold text-ink">{summary.total}</span> records · schema v{summary.schemaVersion}
            {summary.exportedAt ? ` · exported ${new Date(summary.exportedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
            {summary.schemaVersion != null && summary.schemaVersion > SCHEMA_VERSION && <span className="ml-1 text-money-receivable">· newer app version — some data may not load</span>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Field label="How to apply">
              <Segmented value={mode} options={[{ value: 'merge', label: 'Merge' }, { value: 'replace', label: 'Replace all' }]} onChange={(v) => setMode(v as 'merge' | 'replace')} size="sm" />
            </Field>
            <Button icon={UploadCloud} disabled={busy} onClick={run}>{busy ? 'Restoring…' : 'Restore backup'}</Button>
          </div>
          <p className="text-[11px] text-muted">{mode === 'replace' ? 'Replace erases current data first, then loads the backup.' : 'Merge keeps everything you have and adds or updates from the backup.'}</p>
        </div>
      )}
    </Card>
  );
}

function DataSection({ dataset }: { dataset: Dataset }) {
  const app = useApp();
  const hasDemo = dataset.accounts.some((a) => a.demo) || dataset.transactions.some((t) => t.demo);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={UploadCloud} title="Import a statement" subtitle="Bring in a bank or card statement (CSV, Excel or a text PDF), map the columns once, and reconcile it against what you already have." accent={MONEY.net} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-slate">Nothing is added until you review it — matches, duplicates and balance checks are shown first.</p>
          <Button icon={UploadCloud} onClick={() => app.openImport()}>Import statement</Button>
        </div>
      </Card>

      <BackupCard dataset={dataset} />
      <RestoreCard />

      <Card>
        <CardHeader icon={Sparkles} title="Demo data" subtitle="Explore the app with realistic sample records — clearly tagged, never mixed with your real data." accent={MONEY.invest} />
        {hasDemo ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-slate">Demo data is loaded. Remove it to see only your real figures.</p>
            <Button
              variant="danger"
              icon={Trash2}
              disabled={busy}
              onClick={async () => {
                if (await askConfirm({ title: 'Remove demo data?', message: 'The sample accounts and transactions are deleted. Anything you added yourself is kept.', danger: true, confirmLabel: 'Remove demo data' })) {
                  setBusy(true);
                  try {
                    await clearDemoData();
                    toast('Demo data removed', { tone: 'success' });
                  } finally {
                    setBusy(false);
                  }
                }
              }}
            >
              Remove demo data
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-slate">Load a month of sample salary, spends, a shared dinner, an investment and a card bill.</p>
            <Button
              icon={Sparkles}
              variant="soft"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await loadDemoData();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Load demo data
            </Button>
          </div>
        )}
      </Card>

      <Card className="border-money-out/30">
        <CardHeader icon={AlertTriangle} title="Danger zone" subtitle="This cannot be undone." accent={MONEY.out} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-slate">Erase everything — all accounts, transactions and settings — and start fresh.</p>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              if (await askConfirm({ title: 'Erase everything?', message: 'All accounts, transactions and settings are permanently deleted. This cannot be undone.', danger: true, confirmLabel: 'Erase everything' })) {
                await wipeAll();
                toast('All data erased', { tone: 'error' });
              }
            }}
          >
            Erase everything
          </Button>
        </div>
      </Card>

      <p className="px-1 text-[11.5px] leading-snug text-muted">
        Your data lives only in this browser (IndexedDB) and is never uploaded. That also means browser storage is <span className="font-semibold text-slate">not a backup</span> —
        clearing site data, switching devices or a browser update can wipe it. Download a backup regularly and keep the file somewhere off this device.
      </p>
    </div>
  );
}
