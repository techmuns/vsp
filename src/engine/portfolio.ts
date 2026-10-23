import type { Investment, Price, Transaction } from '../db/types';
import { INVESTMENT_TYPES } from './txnTypes';

export interface InvestmentPosition {
  investmentId: string;
  units: number;
  costPaise: number; // cost basis of currently-held units
  valuePaise: number; // units × latest price, or cost if no price is known
  hasPrice: boolean;
  priceAsOf: string | null;
  pricePaise: number | null;
  unrealizedPaise: number | null; // null when there is no price (never invented)
  realizedPaise: number; // cumulative realised P/L up to asOf
  dividendsPaise: number; // payouts received
  chargesPaise: number; // investing costs paid
}

export interface Portfolio {
  byInvestment: Record<string, InvestmentPosition>;
  totalCostPaise: number;
  totalValuePaise: number;
  totalUnrealizedPaise: number; // only across holdings that have a price
  totalRealizedPaise: number;
  totalDividendsPaise: number;
  totalChargesPaise: number;
  pricedValuePaise: number;
  anyMissingPrice: boolean;
}

/** The most recent price for an investment on/before `asOf`. */
export function latestPriceAsOf(prices: Price[], investmentId: string, asOf: string): Price | undefined {
  let best: Price | undefined;
  for (const p of prices) {
    if (p.investmentId !== investmentId || p.date > asOf) continue;
    if (!best || p.date > best.date) best = p;
  }
  return best;
}

/**
 * Replay investment transactions (average-cost) to get holdings, cost basis and
 * realised P/L as of a date; value each holding with the latest known price.
 * Prices are NEVER invented — a holding with no price shows at cost.
 */
export function buildPortfolio(txns: Transaction[], investments: Investment[], prices: Price[], asOf: string): Portfolio {
  const relevant = txns
    .filter((t) => !t.voided && t.investmentId && INVESTMENT_TYPES.has(t.type) && t.date <= asOf)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));

  const acc: Record<string, { units: number; cost: number; realized: number; dividends: number; charges: number }> = {};
  const get = (id: string) => (acc[id] ??= { units: 0, cost: 0, realized: 0, dividends: 0, charges: 0 });

  for (const t of relevant) {
    const a = get(t.investmentId!);
    if (t.type === 'investment_buy' || t.type === 'investment_contribution') {
      a.cost += t.amountPaise;
      if (t.units) a.units += t.units;
    } else if (t.type === 'investment_dividend') {
      a.dividends += t.amountPaise;
    } else if (t.type === 'investment_charge') {
      a.charges += t.amountPaise;
    } else {
      // sell / withdrawal
      const sellUnits = t.units ?? 0;
      let costOut: number;
      if (sellUnits > 0 && a.units > 0) {
        const avg = a.cost / a.units;
        const u = Math.min(sellUnits, a.units);
        costOut = Math.round(avg * u);
        a.units -= u;
      } else {
        costOut = Math.min(a.cost, t.amountPaise);
      }
      a.cost -= costOut;
      a.realized += t.amountPaise - costOut;
    }
  }

  const byInvestment: Record<string, InvestmentPosition> = {};
  const ids = new Set<string>([...investments.map((i) => i.id), ...Object.keys(acc)]);
  let totalCost = 0;
  let totalValue = 0;
  let totalUnreal = 0;
  let totalReal = 0;
  let totalDividends = 0;
  let totalCharges = 0;
  let pricedValue = 0;
  let anyMissing = false;

  for (const id of ids) {
    const a = acc[id] ?? { units: 0, cost: 0, realized: 0, dividends: 0, charges: 0 };
    const lp = latestPriceAsOf(prices, id, asOf);
    const hasPrice = !!lp;
    const value = hasPrice ? Math.round(a.units * lp!.pricePaise) : a.cost;
    const pos: InvestmentPosition = {
      investmentId: id,
      units: a.units,
      costPaise: a.cost,
      valuePaise: value,
      hasPrice,
      priceAsOf: lp?.date ?? null,
      pricePaise: lp?.pricePaise ?? null,
      unrealizedPaise: hasPrice ? value - a.cost : null,
      realizedPaise: a.realized,
      dividendsPaise: a.dividends,
      chargesPaise: a.charges,
    };
    byInvestment[id] = pos;

    totalCost += pos.costPaise;
    totalValue += pos.valuePaise;
    totalReal += pos.realizedPaise;
    totalDividends += pos.dividendsPaise;
    totalCharges += pos.chargesPaise;
    if (hasPrice) {
      totalUnreal += pos.unrealizedPaise ?? 0;
      pricedValue += pos.valuePaise;
    } else if (pos.costPaise > 0 || pos.units > 0) {
      anyMissing = true;
    }
  }

  return {
    byInvestment,
    totalCostPaise: totalCost,
    totalValuePaise: totalValue,
    totalUnrealizedPaise: totalUnreal,
    totalRealizedPaise: totalReal,
    totalDividendsPaise: totalDividends,
    totalChargesPaise: totalCharges,
    pricedValuePaise: pricedValue,
    anyMissingPrice: anyMissing,
  };
}
