// DEMO DATA GENERATOR.
//
// Every name, amount and date in THIS FILE is sample content that stands in for
// records a user would enter. It is the ONLY place such content exists. Demo
// rows are tagged `demo: true` and can be removed in one click (Settings → Data
// or `clearDemoData`). After removal, every screen derives only from real data.

import { db } from '../db/db';
import { addTransaction, saveAccount, saveCategory, saveInvestment, savePerson, savePolicy, savePurpose, upsertPrice, updateSettings } from '../db/repo';
import { startOfMonth, todayISO } from '../lib/dates';

const R = (rupees: number) => Math.round(rupees * 100);

/** Idempotent: does nothing if demo data is already present. */
export async function loadDemoData(): Promise<void> {
  const already = (await db.transactions.filter((t) => t.demo === true).count()) > 0;
  if (already) return;

  const today = todayISO();
  const ym = today.slice(0, 7);
  const day = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
  const openDate = startOfMonth(today);

  // --- accounts ---
  const bank = await saveAccount({ name: 'HDFC Savings', type: 'bank', institution: 'HDFC Bank', openingBalancePaise: R(60000), openingDate: openDate, demo: true });
  const cash = await saveAccount({ name: 'Cash wallet', type: 'cash', openingBalancePaise: R(2500), openingDate: openDate, demo: true });
  const card = await saveAccount({ name: 'ICICI Amazon Pay', type: 'credit_card', institution: 'ICICI Bank', openingBalancePaise: 0, openingDate: openDate, creditLimitPaise: R(200000), demo: true });
  const broker = await saveAccount({ name: 'Zerodha', type: 'broker_cash', institution: 'Zerodha', openingBalancePaise: 0, openingDate: openDate, demo: true });

  // --- purposes (reuse seeded Office/Personal if present) ---
  const purposes = await db.purposes.toArray();
  const office = purposes.find((p) => p.name.toLowerCase() === 'office') ?? (await savePurpose({ name: 'Office', demo: true }));

  // --- categories ---
  const salaryCat = await saveCategory({ name: 'Salary', kind: 'income', demo: true });
  const rent = await saveCategory({ name: 'Rent', kind: 'expense', demo: true });
  const groceries = await saveCategory({ name: 'Groceries', kind: 'expense', demo: true });
  const dining = await saveCategory({ name: 'Food & dining', kind: 'expense', demo: true });
  const transport = await saveCategory({ name: 'Transport', kind: 'expense', demo: true });
  const shopping = await saveCategory({ name: 'Shopping', kind: 'expense', demo: true });
  const utilities = await saveCategory({ name: 'Utilities', kind: 'expense', demo: true });
  const entertainment = await saveCategory({ name: 'Entertainment', kind: 'expense', demo: true });

  // --- person, policy, investments ---
  const aarav = await savePerson({ name: 'Aarav', demo: true });
  await savePolicy({ name: 'Office travel — 50% back', matchPurposeId: office.id, percent: 50, demo: true });
  const reliance = await saveInvestment({ name: 'Reliance Industries', platform: 'Zerodha', assetType: 'stock', symbol: 'RELIANCE', demo: true });
  const flexicap = await saveInvestment({ name: 'Parag Parikh Flexi Cap', platform: 'Zerodha Coin', assetType: 'mutual_fund', demo: true });

  const demo = { demo: true, status: 'cleared' as const };

  // --- salary ---
  await addTransaction({ ...demo, type: 'income', amountPaise: R(92000), date: day(11), accountId: bank.id, categoryId: salaryCat.id, description: 'Monthly salary' });

  // --- everyday UPI spends ---
  await addTransaction({ ...demo, type: 'expense', amountPaise: R(28000), date: day(2), accountId: bank.id, categoryId: rent.id, description: 'House rent' });
  await addTransaction({ ...demo, type: 'expense', amountPaise: R(3420), date: day(5), accountId: bank.id, categoryId: groceries.id, description: 'BigBasket' });
  await addTransaction({ ...demo, type: 'expense', amountPaise: R(780), date: day(8), accountId: bank.id, categoryId: dining.id, description: 'Zomato' });
  await addTransaction({ ...demo, type: 'expense', amountPaise: R(2150), date: day(15), accountId: bank.id, categoryId: utilities.id, description: 'Electricity bill' });

  // --- a cash withdrawal, then a small cash spend (not the same as spending) ---
  await addTransaction({ ...demo, type: 'cash_withdrawal', amountPaise: R(2000), date: day(9), accountId: bank.id, counterAccountId: cash.id, description: 'ATM withdrawal' });
  await addTransaction({ ...demo, type: 'expense', amountPaise: R(260), date: day(13), accountId: cash.id, categoryId: dining.id, description: 'Street food' });

  // --- office trip under the reimbursement policy ---
  await addTransaction({
    ...demo,
    type: 'expense',
    amountPaise: R(1200),
    date: day(12),
    accountId: bank.id,
    categoryId: transport.id,
    purposeId: office.id,
    reimbursable: true,
    description: 'Office cab — client visit',
  });

  // --- shared dinner (friend owes their share) ---
  const dinner = await addTransaction(
    { ...demo, type: 'shared_expense', amountPaise: R(2000), date: day(19), accountId: bank.id, personId: aarav.id, description: 'Dinner with Aarav' },
    [
      { amountPaise: R(800), personId: aarav.id },
      { amountPaise: R(1200), categoryId: dining.id },
    ]
  );
  void dinner;

  // --- transfer to broker + buys ---
  await addTransaction({ ...demo, type: 'transfer', amountPaise: R(20000), date: day(6), accountId: bank.id, counterAccountId: broker.id, description: 'Top-up Zerodha' });
  await addTransaction({ ...demo, type: 'investment_buy', amountPaise: R(15000), date: day(7), accountId: broker.id, investmentId: reliance.id, units: 10, description: 'Bought Reliance' });
  await addTransaction({ ...demo, type: 'investment_buy', amountPaise: R(5000), date: day(7), accountId: broker.id, investmentId: flexicap.id, units: 100, description: 'SIP — Parag Parikh' });

  // --- card: a paid purchase + an outstanding one ---
  await addTransaction({ ...demo, type: 'cc_purchase', amountPaise: R(4999), date: day(18), accountId: card.id, categoryId: shopping.id, description: 'Amazon order' });
  await addTransaction({ ...demo, type: 'cc_repayment', amountPaise: R(4999), date: day(20), accountId: bank.id, counterAccountId: card.id, description: 'Card bill payment' });
  await addTransaction({ ...demo, type: 'cc_purchase', amountPaise: R(1299), date: day(21), accountId: card.id, categoryId: entertainment.id, description: 'Netflix + Spotify' });

  // --- prices (so the portfolio shows value + unrealised P/L) ---
  await upsertPrice({ investmentId: reliance.id, date: day(22), pricePaise: R(1650), source: 'demo', asOf: day(22) });
  await upsertPrice({ investmentId: flexicap.id, date: day(22), pricePaise: R(52), source: 'demo', asOf: day(22) });

  await updateSettings({ demoMode: true });
}
