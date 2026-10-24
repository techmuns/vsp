import { useMemo, useState } from 'react';
import {
  Users,
  Search,
  X,
  Plus,
  HandCoins,
  ArrowDownRight,
  Scale,
  FileDown,
  Printer,
  Handshake,
  ArrowRight,
} from 'lucide-react';
import type { Dataset } from '../db/hooks';
import type { Snapshot } from '../engine';
import { getTxnType, personLedger, personPositions, openItems, allocateSettlement, type PersonEntry } from '../engine';
import type { DateRange } from '../lib/dates';
import { useApp } from '../app/context';
import { MONEY } from '../lib/brand';
import { fmtINR, fmtDate } from '../lib/format';
import { todayISO } from '../db/ids';
import { addTransaction, savePerson } from '../db/repo';
import { exportCsv, exportXlsx, printDocument, esc, type Row } from '../lib/exporters';
import { toast } from '../app/toast';
import { askPrompt } from '../app/confirm';
import { Card, PageHeader, EmptyState } from '../components/ui/Card';
import { Button, AmountField, DateField, Dropdown, Field, Toggle, type Option } from '../components/ui/Controls';

export default function People({ dataset, range }: { dataset: Dataset; snapshot: Snapshot; range: DateRange }) {
  const asOf = range.to;
  const eInput = useMemo(() => ({ transactions: dataset.transactions, splits: dataset.splits, policies: dataset.policies }), [dataset]);
  const positions = useMemo(() => personPositions(eInput, asOf), [eInput, asOf]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'balance' | 'name'>('balance');
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const rows = dataset.people
    .filter((p) => p.active || positions[p.id])
    .map((p) => ({ person: p, pos: positions[p.id] ?? { receivablePaise: 0, payablePaise: 0, netPaise: 0 } }))
    .filter((r) => !q.trim() || r.person.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.person.name.localeCompare(b.person.name) : Math.abs(b.pos.netPaise) - Math.abs(a.pos.netPaise)));

  const totalOwed = Object.values(positions).reduce((s, p) => s + Math.max(0, p.netPaise), 0);
  const totalYouOwe = Object.values(positions).reduce((s, p) => s + Math.max(0, -p.netPaise), 0);
  const net = totalOwed - totalYouOwe;

  const empty = dataset.people.length === 0;

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        icon={Users}
        title="People"
        subtitle="Who owes you, and whom you owe."
        accent={MONEY.receivable}
        right={<Button size="sm" icon={Plus} onClick={async () => { const n = await askPrompt({ title: 'Add a person', placeholder: 'Name', confirmLabel: 'Add' }); if (n?.trim()) { await savePerson({ name: n.trim() }); toast('Person added', { tone: 'success' }); } }}>Add person</Button>}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={HandCoins} label="Owed to you" value={fmtINR(totalOwed)} color={MONEY.receivable} />
        <StatCard icon={ArrowDownRight} label="You owe" value={fmtINR(totalYouOwe)} color={MONEY.payable} />
        <StatCard icon={Scale} label="Net" value={fmtINR(net)} color={net >= 0 ? MONEY.save : MONEY.out} />
      </div>

      <Card pad={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-[13px] text-ink outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15" />
          </div>
          <Dropdown value={sort} options={[{ value: 'balance', label: 'Sort: balance' }, { value: 'name', label: 'Sort: name' }]} onChange={(v) => setSort(v as 'balance' | 'name')} size="sm" width={150} />
        </div>
      </Card>

      {empty ? (
        <Card>
          <EmptyState icon={Users} title="No people yet" hint="Add people you lend to, borrow from, or split expenses with." action={<Button icon={Plus} onClick={async () => { const n = await askPrompt({ title: 'Add a person', placeholder: 'Name', confirmLabel: 'Add' }); if (n?.trim()) await savePerson({ name: n.trim() }); }}>Add person</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ person, pos }) => {
            const settled = pos.netPaise === 0;
            const theyOwe = pos.netPaise > 0;
            const color = settled ? MONEY.transfer : theyOwe ? MONEY.receivable : MONEY.payable;
            return (
              <button key={person.id} onClick={() => setOpenPerson(person.id)} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 text-left shadow-card transition hover:shadow-card-hover focus-ring">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-[15px] font-bold" style={{ background: `${color}18`, color }}>
                  {person.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{person.name}</span>
                  <span className="block text-[11.5px]" style={{ color }}>{settled ? 'Settled up' : theyOwe ? 'Owes you' : 'You owe'}</span>
                </span>
                <span className="tnum shrink-0 text-right font-display text-[15px] font-extrabold" style={{ color }}>{settled ? '—' : fmtINR(Math.abs(pos.netPaise))}</span>
              </button>
            );
          })}
        </div>
      )}

      {openPerson && <PersonDrawer personId={openPerson} dataset={dataset} eInput={eInput} asOf={asOf} onClose={() => setOpenPerson(null)} />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof HandCoins; label: string; value: string; color: string }) {
  return (
    <Card pad={false} className="px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-grey">
        <Icon size={13} style={{ color }} /> {label}
      </div>
      <div className="tnum mt-1 font-display text-[18px] font-extrabold leading-none" style={{ color }}>{value}</div>
    </Card>
  );
}

function PersonDrawer({ personId, dataset, eInput, asOf, onClose }: { personId: string; dataset: Dataset; eInput: { transactions: Dataset['transactions']; splits: Dataset['splits']; policies: Dataset['policies'] }; asOf: string; onClose: () => void }) {
  const app = useApp();
  const person = dataset.people.find((p) => p.id === personId);
  const { entries, netPaise } = useMemo(() => personLedger(eInput, personId, asOf), [eInput, personId, asOf]);
  const open = useMemo(() => openItems(entries), [entries]);
  const [settleOpen, setSettleOpen] = useState(false);

  if (!person) return null;
  const theyOwe = netPaise > 0;
  const color = netPaise === 0 ? MONEY.transfer : theyOwe ? MONEY.receivable : MONEY.payable;

  function exportStatement(kind: 'xlsx' | 'csv') {
    const rows: Row[] = entries.map((e) => ({
      Date: e.date,
      Activity: e.description || getTxnType(e.type)?.label || e.type,
      Type: getTxnType(e.type)?.label ?? e.type,
      'Change (₹)': e.deltaPaise / 100,
      'Owed to you (₹)': e.runningPaise / 100,
      Due: e.dueDate ?? '',
    }));
    const name = `kosh-statement-${person!.name.replace(/\s+/g, '-').toLowerCase()}`;
    kind === 'xlsx' ? exportXlsx(name, 'Statement', rows) : exportCsv(name, rows);
    toast('Statement exported', { tone: 'success' });
  }

  function printStatement() {
    const body = `<h1>${esc(person!.name)} — statement</h1><div class="sub">As of ${esc(fmtDate(asOf))} · ${netPaise >= 0 ? 'Owes you' : 'You owe'} ${esc(fmtINR(Math.abs(netPaise)))}</div>
      <table><thead><tr><th>Date</th><th>Activity</th><th class="r">Change</th><th class="r">Owed to you</th></tr></thead><tbody>
      ${entries.map((e) => `<tr><td>${esc(fmtDate(e.date))}</td><td>${esc(e.description || getTxnType(e.type)?.label || e.type)}</td><td class="r">${esc(fmtINR(e.deltaPaise))}</td><td class="r">${esc(fmtINR(e.runningPaise))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="3" class="r">Net</td><td class="r">${esc(fmtINR(netPaise))}</td></tr></tbody></table>`;
    printDocument(`${person!.name} statement`, body);
  }

  const quick = (type: string, label: string) => (
    <Button variant="outline" size="sm" onClick={() => { onClose(); app.openEditor({ prefill: { type, personId } }); }}>{label}</Button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white shadow-drawer animate-slide-in sm:w-[520px]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl font-display text-[16px] font-bold" style={{ background: `${color}18`, color }}>{person.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h2 className="font-display text-[17px] font-extrabold leading-tight text-ink">{person.name}</h2>
              <p className="tnum text-[12.5px] font-semibold" style={{ color }}>{netPaise === 0 ? 'Settled up' : `${theyOwe ? 'Owes you' : 'You owe'} ${fmtINR(Math.abs(netPaise))}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-grey hover:bg-black/5"><X size={18} /></button>
        </div>

        <div className="nice-scroll flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {netPaise !== 0 && <Button size="sm" icon={Handshake} onClick={() => setSettleOpen(true)}>Settle up</Button>}
            {quick('lent', 'Lent')}
            {quick('borrowed', 'Borrowed')}
            {quick('loan_repayment_received', 'Got money back')}
            {quick('shared_expense', 'Paid for them')}
          </div>

          {open.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-grey">Open items</h3>
              <div className="space-y-1.5">
                {open.map((it) => (
                  <div key={it.txnId} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas/50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-semibold text-ink">{it.description || 'Item'}</div>
                      <div className="text-[11px] text-grey">{fmtDate(it.date)}{it.dueDate ? ` · due ${fmtDate(it.dueDate)}` : ''}{it.remainingPaise < it.originalPaise ? ` · ${fmtINR(it.originalPaise)} original` : ''}</div>
                    </div>
                    <span className="tnum shrink-0 font-bold text-money-receivable">{fmtINR(it.remainingPaise)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-grey">Full ledger</h3>
              <div className="flex gap-1.5">
                <button onClick={() => exportStatement('xlsx')} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-slate hover:border-brand/40"><FileDown size={12} /> xlsx</button>
                <button onClick={() => exportStatement('csv')} className="rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-slate hover:border-brand/40">CSV</button>
                <button onClick={printStatement} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-slate hover:border-brand/40"><Printer size={12} /> Print</button>
              </div>
            </div>
            {entries.length === 0 ? (
              <EmptyState icon={Users} title="No activity yet" hint="Use the quick actions above." compact />
            ) : (
              <div className="overflow-hidden rounded-xl border border-line">
                {[...entries].reverse().map((e) => <LedgerRow key={e.txnId} e={e} onOpen={() => { onClose(); app.openEditor({ txnId: e.txnId }); }} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      {settleOpen && <SettleDialog person={person.name} personId={personId} netPaise={netPaise} openItems={open} dataset={dataset} onClose={() => setSettleOpen(false)} onDone={() => { setSettleOpen(false); }} />}
    </div>
  );
}

function LedgerRow({ e, onOpen }: { e: PersonEntry; onOpen: () => void }) {
  const up = e.deltaPaise > 0;
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 border-b border-line/70 px-3 py-2.5 text-left last:border-0 hover:bg-canvas">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold text-ink">{e.description || getTxnType(e.type)?.label || e.type}</div>
        <div className="text-[11px] text-grey">{fmtDate(e.date)} · {getTxnType(e.type)?.label}{e.dueDate ? ` · due ${fmtDate(e.dueDate)}` : ''}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tnum text-[12.5px] font-bold" style={{ color: up ? MONEY.receivable : MONEY.save }}>{up ? '+' : '−'}{fmtINR(Math.abs(e.deltaPaise))}</div>
        <div className="tnum text-[10.5px] text-grey">bal {fmtINR(e.runningPaise)}</div>
      </div>
    </button>
  );
}

function SettleDialog({ person, personId, netPaise, openItems: items, dataset, onClose, onDone }: { person: string; personId: string; netPaise: number; openItems: { txnId: string; remainingPaise: number; description: string }[]; dataset: Dataset; onClose: () => void; onDone: () => void }) {
  const theyOwe = netPaise > 0;
  const [amount, setAmount] = useState<number | null>(Math.abs(netPaise));
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [writeOff, setWriteOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const accountOpts: Option[] = dataset.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));
  const alloc = amount ? allocateSettlement(items.map((i) => ({ id: i.txnId, outstandingPaise: i.remainingPaise })), amount) : null;

  const canSave = !!amount && amount > 0 && (writeOff || !!accountId);

  async function save() {
    if (!canSave || !amount) return;
    setBusy(true);
    try {
      const type = theyOwe ? 'loan_repayment_received' : 'borrow_repayment_paid';
      await addTransaction({
        type,
        amountPaise: amount,
        date,
        personId,
        accountId: writeOff ? undefined : accountId,
        description: writeOff ? `Wrote off ${person}` : `Settle up with ${person}`,
        notes: alloc && alloc.appliedPaise > 0 ? `Applied to ${alloc.allocations.filter((a) => a.appliedPaise > 0).length} item(s)` : undefined,
      });
      toast(writeOff ? 'Written off' : 'Settled up', { tone: 'success' });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-pop animate-fade-up">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-display text-[15px] font-bold text-ink">Settle up with {person}</h3>
          <button onClick={onClose} className="text-grey hover:text-ink"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-[12.5px] text-grey">{theyOwe ? `${person} owes you ` : `You owe ${person} `}<b className="text-slate">{fmtINR(Math.abs(netPaise))}</b>. Record {theyOwe ? 'the money coming back' : 'your repayment'} — it is never counted as income.</p>
          <Field label="Amount"><AmountField paise={amount} onPaise={setAmount} /></Field>
          {!writeOff && (
            <Field label={theyOwe ? 'Into account' : 'From account'} required>
              <Dropdown value={accountId} options={accountOpts} onChange={setAccountId} placeholder="Pick an account" width="100%" />
            </Field>
          )}
          <Field label="Date"><DateField value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          {theyOwe && (
            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
              <div><div className="text-[12.5px] font-semibold text-slate">Write off instead</div><div className="text-[11px] text-grey">Forgive the balance — no money changes hands.</div></div>
              <Toggle checked={writeOff} onChange={setWriteOff} color={MONEY.out} />
            </div>
          )}
          {alloc && items.length > 0 && amount != null && (
            <div className="rounded-xl bg-canvas/60 p-3 text-[11.5px]">
              <div className="mb-1 font-semibold text-slate">This clears:</div>
              {alloc.allocations.filter((a) => a.appliedPaise > 0).map((a) => {
                const it = items.find((i) => i.txnId === a.id);
                return <div key={a.id} className="flex justify-between text-grey"><span className="truncate">{it?.description || 'Item'}</span><span className="tnum">{fmtINR(a.appliedPaise)}{a.remainingPaise > 0 ? ` (−${fmtINR(a.remainingPaise)} left)` : ''}</span></div>;
              })}
              {alloc.leftoverPaise > 0 && <div className="mt-1 text-[11px] italic text-money-receivable">{fmtINR(alloc.leftoverPaise)} more than owed (overpayment).</div>}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={save} disabled={!canSave || busy} className="flex-[2]" iconRight={ArrowRight}>{busy ? 'Saving…' : writeOff ? 'Write off' : 'Record settlement'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
