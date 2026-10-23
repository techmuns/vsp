import { Sparkles, Plus, ArrowRight } from 'lucide-react';
import type { Page } from '../app/nav';
import { MAIN_NAV } from '../app/nav';
import { useApp } from '../app/context';
import type { Dataset } from '../db/hooks';
import type { Snapshot } from '../engine';
import { Card, PageHeader, MiniStat } from '../components/ui/Card';
import { Button } from '../components/ui/Controls';
import { fmtCompact, fmtINR } from '../lib/format';
import { MONEY } from '../lib/brand';

const PLANS: Record<Exclude<Page, 'overview' | 'settings'>, { subtitle: string; blurb: string; bullets: string[] }> = {
  transactions: {
    subtitle: 'Every rupee in and out — searchable and filterable.',
    blurb: 'A fast, filterable ledger of all your transactions with inline editing, bulk categorise, and an easy import from bank/card statements.',
    bullets: ['Search, filter & sort every transaction', 'Edit, split or void inline', 'Import statements (xlsx / CSV)'],
  },
  expenses: {
    subtitle: 'Where your money actually goes.',
    blurb: 'Category and merchant deep-dives, budgets vs. actuals, and month-on-month spending trends — all from your real data.',
    bullets: ['Category & subcategory breakdowns', 'Budgets vs. actuals', 'Trends and recurring spends'],
  },
  investments: {
    subtitle: 'Your portfolio, clearly.',
    blurb: 'Holdings across platforms with units, cost, live-ish prices, realised & unrealised P/L, SIP tracking and allocation.',
    bullets: ['Holdings, lots & P/L', 'SIPs and contributions', 'Allocation by platform & asset'],
  },
  people: {
    subtitle: 'Who owes you, and whom you owe.',
    blurb: 'Track money lent, borrowed and shared with friends and family — with per-person history and one-tap settle-up.',
    bullets: ['Per-person balances & history', 'Settle up in one tap', 'Shared-expense splits'],
  },
  reimbursements: {
    subtitle: 'From eligible to received — nothing slips.',
    blurb: 'Follow every claimable expense through eligible → claimable → submitted → received, with your own policies and caps.',
    bullets: ['Policy-driven claimable amounts', 'Claim batches & status', 'Eligible vs. received, never mixed'],
  },
  reports: {
    subtitle: 'The bigger picture.',
    blurb: 'Build custom reports, a full year-in-review, and export anything — always computed from your private, on-device data.',
    bullets: ['Custom date & category reports', 'Year in review', 'Export to xlsx / CSV'],
  },
};

export function StubPage({ page, dataset, snapshot }: { page: Page; dataset: Dataset; snapshot: Snapshot | null }) {
  const app = useApp();
  const item = MAIN_NAV.find((n) => n.key === page)!;
  const plan = PLANS[page as keyof typeof PLANS];

  const liveStat = (() => {
    if (!snapshot) return null;
    switch (page) {
      case 'transactions':
        return { label: 'Transactions recorded', value: dataset.transactions.filter((t) => !t.voided).length.toString(), color: MONEY.transfer };
      case 'expenses':
        return { label: 'Spent this period', value: fmtINR(snapshot.expensePaise), color: MONEY.out };
      case 'investments':
        return { label: 'Portfolio value', value: fmtCompact(snapshot.portfolio.totalValuePaise), color: MONEY.invest };
      case 'people':
        return { label: 'Owed to you', value: fmtINR(snapshot.totalReceivablePaise), color: MONEY.receivable };
      case 'reimbursements':
        return { label: 'Reimbursement pending', value: fmtINR(snapshot.reimb.outstandingPaise), color: MONEY.reimb };
      default:
        return { label: 'Net worth', value: fmtCompact(snapshot.netWorthPaise), color: MONEY.net };
    }
  })();

  return (
    <div className="animate-fade-up">
      <PageHeader icon={item.icon} title={item.label} subtitle={plan.subtitle} accent={item.color} />

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-10" style={{ background: item.color }} />
        <div className="relative grid gap-6 sm:grid-cols-[1.4fr_1fr] sm:items-center">
          <div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{ background: `${item.color}18`, color: item.color }}
            >
              <Sparkles size={12} /> Coming in Phase 2
            </span>
            <h3 className="mt-3 font-display text-[18px] font-extrabold text-ink">{item.label} lands next</h3>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-grey">{plan.blurb}</p>
            <ul className="mt-3 space-y-1.5">
              {plan.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[12.5px] text-slate">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={Plus} onClick={() => app.openQuickAdd()}>
                Add a transaction
              </Button>
              <Button variant="outline" iconRight={ArrowRight} onClick={() => app.goTo('overview')}>
                Back to overview
              </Button>
            </div>
          </div>
          {liveStat && (
            <div className="rounded-2xl border border-line bg-canvas/70 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-grey">Already tracked</p>
              <MiniStat label={liveStat.label} value={liveStat.value} color={liveStat.color} />
              <p className="mt-2 text-[11px] leading-snug text-grey">
                This figure is live from your real data and powers the Overview today — the full {item.label.toLowerCase()} screen is next.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
