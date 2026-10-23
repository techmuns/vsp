import { describe, it, expect } from 'vitest';
import { buildPortfolio } from '../portfolio';
import { inv, price, R, txn } from './_helpers';

describe('portfolio', () => {
  it('values a holding with the latest known price and shows unrealised P/L', () => {
    const txns = [txn({ type: 'investment_buy', amountPaise: R(10000), accountId: 'broker', investmentId: 'x', units: 10, date: '2026-05-01' })];
    const prices = [price('x', '2026-10-10', R(1200))]; // ₹1,200 per unit
    const pf = buildPortfolio(txns, [inv('x')], prices, '2026-10-31');
    const pos = pf.byInvestment['x'];
    expect(pos.costPaise).toBe(R(10000));
    expect(pos.valuePaise).toBe(R(12000)); // 10 × ₹1,200
    expect(pos.unrealizedPaise).toBe(R(2000));
    expect(pos.priceAsOf).toBe('2026-10-10');
    expect(pf.anyMissingPrice).toBe(false);
  });

  it('never invents a price: with no price, value = cost and P/L is unknown', () => {
    const txns = [txn({ type: 'investment_buy', amountPaise: R(10000), accountId: 'broker', investmentId: 'y', units: 5, date: '2026-05-01' })];
    const pf = buildPortfolio(txns, [inv('y')], [], '2026-10-31');
    const pos = pf.byInvestment['y'];
    expect(pos.valuePaise).toBe(R(10000)); // falls back to cost
    expect(pos.unrealizedPaise).toBeNull();
    expect(pos.priceAsOf).toBeNull();
    expect(pf.anyMissingPrice).toBe(true);
  });

  it('a partial sale realises P/L on average cost and keeps the rest', () => {
    const txns = [
      txn({ type: 'investment_buy', amountPaise: R(10000), accountId: 'broker', investmentId: 'z', units: 10, date: '2026-05-01' }),
      txn({ type: 'investment_sell', amountPaise: R(5000), accountId: 'broker', investmentId: 'z', units: 4, date: '2026-09-01' }),
    ];
    const pf = buildPortfolio(txns, [inv('z')], [], '2026-10-31');
    const pos = pf.byInvestment['z'];
    expect(pos.units).toBe(6);
    expect(pos.costPaise).toBe(R(6000)); // 6 units × avg ₹1,000
    expect(pos.realizedPaise).toBe(R(1000)); // sold 4 @ cost 4,000, got 5,000
  });

  it('a price before a holding existed is ignored (as-of respected)', () => {
    const txns = [txn({ type: 'investment_buy', amountPaise: R(10000), accountId: 'broker', investmentId: 'w', units: 10, date: '2026-05-01' })];
    const prices = [price('w', '2026-12-01', R(1500))];
    const pf = buildPortfolio(txns, [inv('w')], prices, '2026-06-01'); // as-of before the price
    expect(pf.byInvestment['w'].hasPrice).toBe(false);
    expect(pf.byInvestment['w'].valuePaise).toBe(R(10000));
  });

  it('tracks dividends and charges without disturbing cost basis or units', () => {
    const txns = [
      txn({ type: 'investment_buy', amountPaise: R(10000), accountId: 'broker', investmentId: 'd', units: 10, date: '2026-05-01' }),
      txn({ type: 'investment_dividend', amountPaise: R(300), accountId: 'broker', investmentId: 'd', date: '2026-07-01' }),
      txn({ type: 'investment_charge', amountPaise: R(50), accountId: 'broker', investmentId: 'd', date: '2026-08-01' }),
    ];
    const pf = buildPortfolio(txns, [inv('d')], [], '2026-10-31');
    const pos = pf.byInvestment['d'];
    expect(pos.units).toBe(10);
    expect(pos.costPaise).toBe(R(10000));
    expect(pos.dividendsPaise).toBe(R(300));
    expect(pos.chargesPaise).toBe(R(50));
    expect(pf.totalDividendsPaise).toBe(R(300));
    expect(pf.totalChargesPaise).toBe(R(50));
  });
});
