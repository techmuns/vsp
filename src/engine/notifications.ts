import type { Account, NotificationPrefs, Person, ReimbursementPolicy, Recurring, Settings, Split, Transaction } from '../db/types';
import type { ISODate } from '../lib/dates';
import { addDays } from '../lib/dates';
import type { Snapshot } from './compute';
import { personPositions } from './people';
import { describeSchedule, isDue, isMissed } from './recurring';

export type NotifSeverity = 'info' | 'warn' | 'alert';

export interface KoshNotification {
  id: string; // stable, so dismissals persist
  kind: string;
  severity: NotifSeverity;
  title: string;
  hint: string;
  /** A page key the UI can navigate to. */
  target?: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  bills: true,
  cardDue: true,
  receivables: true,
  reimbursements: true,
  weeklyClaim: true,
  missingDetails: true,
  reconciliation: true,
  spendingLimit: true,
};

export interface NotifInput {
  settings: Settings | null;
  recurring: Recurring[];
  accounts: Account[];
  people: Person[];
  transactions: Transaction[];
  splits: Split[];
  policies: ReimbursementPolicy[];
  snapshot: Snapshot;
  today: ISODate;
}

const fmtRs = (p: number) => `₹${Math.round(Math.abs(p) / 100).toLocaleString('en-IN')}`;

/** Build the in-dashboard notification list (quiet, deduped, prefs-aware). */
export function buildNotifications(input: NotifInput): KoshNotification[] {
  const prefs = input.settings?.notificationPrefs ?? DEFAULT_PREFS;
  const { snapshot: s, today } = input;
  const out: KoshNotification[] = [];
  const soon = addDays(today, 5);

  // Recurring bills — due soon or missed
  if (prefs.bills) {
    for (const r of input.recurring) {
      if (!r.active) continue;
      const name = r.template.description || 'Recurring item';
      if (isMissed(r, today)) {
        out.push({ id: `bill-missed:${r.id}:${r.nextDate}`, kind: 'bill', severity: 'warn', title: `${name} looks missed`, hint: `Was due ${r.nextDate} (${describeSchedule(r.schedule)}). Confirm or skip it.`, target: 'settings' });
      } else if (isDue(r, today) || r.nextDate <= soon) {
        out.push({ id: `bill-due:${r.id}:${r.nextDate}`, kind: 'bill', severity: 'info', title: `${name} is coming up`, hint: `Due ${r.nextDate} (${describeSchedule(r.schedule)}).`, target: 'settings' });
      }
    }
  }

  // Credit-card balances outstanding
  if (prefs.cardDue) {
    for (const b of s.balances) {
      if (b.account.type === 'credit_card' && b.balancePaise < 0) {
        out.push({ id: `card:${b.account.id}:${today.slice(0, 7)}`, kind: 'card', severity: 'warn', title: `${fmtRs(b.balancePaise)} on ${b.account.name}`, hint: 'Outstanding card balance — pay before the due date to avoid interest.', target: 'transactions' });
      }
    }
  }

  // Overdue receivables
  if (prefs.receivables) {
    const pos = personPositions({ transactions: input.transactions, splits: input.splits, policies: input.policies }, today);
    const overdueByPerson = new Map<string, ISODate>();
    for (const t of input.transactions) {
      if (t.voided || !t.personId || !t.dueDate || t.dueDate >= today) continue;
      if ((t.type === 'lent' || t.type === 'shared_expense') && (pos[t.personId]?.netPaise ?? 0) > 0) {
        const cur = overdueByPerson.get(t.personId);
        if (!cur || t.dueDate < cur) overdueByPerson.set(t.personId, t.dueDate);
      }
    }
    for (const [pid, due] of overdueByPerson) {
      const name = input.people.find((p) => p.id === pid)?.name ?? 'Someone';
      out.push({ id: `recv:${pid}:${due}`, kind: 'receivable', severity: 'warn', title: `${name} is overdue`, hint: `${fmtRs(pos[pid].netPaise)} was due back by ${due}.`, target: 'people' });
    }
  }

  // Reimbursement pending
  if (prefs.reimbursements && s.reimb.outstandingPaise > 0) {
    out.push({ id: `reimb:${today.slice(0, 7)}`, kind: 'reimbursement', severity: 'info', title: `${fmtRs(s.reimb.outstandingPaise)} reimbursement pending`, hint: 'Claimable but not yet received.', target: 'reimbursements' });
  }

  // Weekly claim reminder
  if (prefs.weeklyClaim && s.reimb.claimablePaise > 0) {
    out.push({ id: `claim:${s.range.from}`, kind: 'claim', severity: 'info', title: `${fmtRs(s.reimb.claimablePaise)} ready to claim`, hint: 'Build a claim batch for this cycle.', target: 'reimbursements' });
  }

  // Uncategorised transactions
  if (prefs.missingDetails && s.uncategorisedCount > 0) {
    out.push({ id: `uncat:${s.range.from}:${s.uncategorisedCount}`, kind: 'missing', severity: 'info', title: `${s.uncategorisedCount} need a category`, hint: 'Categorise them for cleaner insights.', target: 'transactions' });
  }

  // Spending-limit alert
  if (prefs.spendingLimit && input.settings?.spendingLimitPaise && s.expensePaise > input.settings.spendingLimitPaise) {
    out.push({ id: `limit:${s.range.from}`, kind: 'limit', severity: 'alert', title: `Over your spending limit`, hint: `You've spent ${fmtRs(s.expensePaise)} against a ${fmtRs(input.settings.spendingLimitPaise)} limit.`, target: 'expenses' });
  }

  const order: Record<NotifSeverity, number> = { alert: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
