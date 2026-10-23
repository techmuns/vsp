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
} from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { AccountType, CategoryKind } from '../db/types';
import {
  clearDemoData,
  saveAccount,
  saveCategory,
  savePerson,
  savePolicy,
  savePurpose,
  setActive,
  updateSettings,
  wipeAll,
} from '../db/repo';
import { loadDemoData } from '../demo/generate';
import { accountIcon, accountColor } from '../app/lookups';
import { colorForId, MONEY } from '../lib/brand';
import { fmtINR } from '../lib/format';
import { Card, CardHeader, PageHeader, Badge, EmptyState } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { AmountField, Button, DateField, Dropdown, Field, TextField, type Option } from '../components/ui/Controls';

type Section = 'prefs' | 'accounts' | 'categories' | 'people' | 'reimburse' | 'data';

export default function Settings({ dataset }: { dataset: Dataset }) {
  const [section, setSection] = useState<Section>('prefs');
  const tabs: { key: Section; label: string; color?: string }[] = [
    { key: 'prefs', label: 'Preferences', color: MONEY.net },
    { key: 'accounts', label: 'Accounts', color: MONEY.net },
    { key: 'categories', label: 'Categories', color: MONEY.out },
    { key: 'people', label: 'People & purposes', color: MONEY.receivable },
    { key: 'reimburse', label: 'Reimbursements', color: MONEY.reimb },
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

/* ------------------------------------------------------------------ data */

function DataSection({ dataset }: { dataset: Dataset }) {
  const hasDemo = dataset.accounts.some((a) => a.demo) || dataset.transactions.some((t) => t.demo);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
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
                if (confirm('Remove all demo data? Your real records are kept.')) {
                  setBusy(true);
                  try {
                    await clearDemoData();
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
              if (confirm('Erase ALL data permanently? This cannot be undone.')) {
                await wipeAll();
              }
            }}
          >
            Erase everything
          </Button>
        </div>
      </Card>

      <p className="px-1 text-[11.5px] leading-snug text-muted">
        Your data lives only in this browser (IndexedDB). It is never uploaded. Clearing your browser’s site data will remove it, so treat this as a
        local notebook.
      </p>
    </div>
  );
}
