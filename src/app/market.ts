import { useEffect, useState } from 'react';
import type { Investment, Price } from '../db/types';
import { daysBetween, todayISO } from '../lib/dates';

/** One public market-price row. Identifiers + price only — never personal data. */
export interface MarketPriceRow {
  key: string; // stock symbol OR mutual-fund ISIN
  pricePaise: number;
  asOf: string; // YYYY-MM-DD
  source: string;
}

export interface MarketPricesState {
  rows: MarketPriceRow[];
  loaded: boolean;
  error: string | null;
}

/**
 * Loads the optional public price file committed by the GitHub Action. The app
 * works fully offline without it — absence or failure is never fatal.
 */
export function useMarketPrices(): MarketPricesState {
  const [state, setState] = useState<MarketPricesState>({ rows: [], loaded: false, error: null });
  useEffect(() => {
    let alive = true;
    const url = `${import.meta.env.BASE_URL}data/market-prices.json`;
    fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!alive) return;
        const rows: MarketPriceRow[] = Array.isArray(data)
          ? data.filter((d) => d && typeof d.key === 'string' && typeof d.pricePaise === 'number' && typeof d.asOf === 'string')
          : [];
        setState({ rows, loaded: true, error: null });
      })
      .catch((e) => {
        if (!alive) return;
        setState({ rows: [], loaded: true, error: String(e?.message ?? e) });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Match a market row to an investment by symbol or ISIN (case-insensitive). */
export function marketRowFor(inv: Investment, rows: MarketPriceRow[]): MarketPriceRow | undefined {
  const sym = inv.symbol?.trim().toUpperCase();
  const isin = inv.isin?.trim().toUpperCase();
  return rows.find((r) => {
    const k = r.key.trim().toUpperCase();
    return (sym && k === sym) || (isin && k === isin);
  });
}

/**
 * Merge manual DB prices with the public feed. Manual prices come first, so on
 * an equal date they win; otherwise `latestPriceAsOf` picks the newest date.
 * Nothing is written back to the DB — the feed stays ephemeral and public.
 */
export function mergePrices(dbPrices: Price[], investments: Investment[], rows: MarketPriceRow[]): Price[] {
  if (!rows.length) return dbPrices;
  const extra: Price[] = [];
  for (const inv of investments) {
    const m = marketRowFor(inv, rows);
    if (!m) continue;
    extra.push({ id: `${inv.id}:mkt:${m.asOf}`, investmentId: inv.id, date: m.asOf, pricePaise: m.pricePaise, source: m.source, asOf: m.asOf });
  }
  return [...dbPrices, ...extra];
}

/** A price is "stale" when it is more than ~3 trading days old. */
export function isStalePrice(asOf: string | null | undefined, today = todayISO()): boolean {
  if (!asOf) return false;
  return daysBetween(asOf, today) > 4;
}
