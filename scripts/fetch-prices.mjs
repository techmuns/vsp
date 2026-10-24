#!/usr/bin/env node
// Fetch PUBLIC market prices for the watchlist and write
// public/data/market-prices.json. Identifiers in → prices out; this script
// never sees or touches any personal finance data.
//
// Sources (no API key needed):
//   • Mutual-fund NAVs  → AMFI's public NAVAll.txt, matched by ISIN
//   • Stock prices      → Yahoo Finance public chart endpoint (symbol.NS / .BO)
//
// If you switch to a stock source that needs a key, read it from an env var
// backed by a GitHub repo secret (e.g. process.env.STOCK_API_KEY) — never hardcode.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST = join(ROOT, 'public/data/watchlist.json');
const OUT = join(ROOT, 'public/data/market-prices.json');

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** "23-Oct-2026" → "2026-10-23" */
function amfiDate(s) {
  const m = /^(\d{2})-(\w{3})-(\d{4})$/.exec((s || '').trim());
  if (!m) return new Date().toISOString().slice(0, 10);
  return `${m[3]}-${MONTHS[m[2]] ?? '01'}-${m[1]}`;
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { headers: { 'user-agent': 'kosh-price-bot/1.0' }, ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Publish EVERY AMFI scheme NAV, keyed by ISIN. The app matches a user's funds
// locally by ISIN, so their holdings never need to be listed anywhere public —
// any mutual fund with an ISIN gets a live daily NAV automatically.
async function fetchAllMutualFunds() {
  const out = [];
  const seen = new Set();
  try {
    const txt = await fetchText('https://www.amfiindia.com/spages/NAVAll.txt');
    for (const line of txt.split('\n')) {
      const f = line.split(';');
      if (f.length < 6) continue; // skip headers / section titles
      // NAV and Date are always the last two columns (AMFI has added Plan/Option
      // columns over time, so fixed indexes 4/5 are not safe).
      const nav = f[f.length - 2];
      if (!nav || isNaN(Number(nav)) || Number(nav) <= 0) continue;
      const asOf = amfiDate(f[f.length - 1]);
      const pricePaise = toPaise(nav);
      // A scheme can carry two ISINs (payout + reinvestment); emit both.
      for (const col of [f[1], f[2]]) {
        const isin = (col || '').trim().toUpperCase();
        if (/^INF[0-9A-Z]{9}$/.test(isin) && !seen.has(isin)) {
          seen.add(isin);
          out.push({ key: isin, pricePaise, asOf, source: 'amfi' });
        }
      }
    }
  } catch (e) {
    console.error('AMFI fetch failed:', e.message);
  }
  return out;
}

async function fetchStocks(symbols) {
  const out = [];
  for (const sym of symbols) {
    try {
      const json = JSON.parse(await fetchText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`));
      const meta = json?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (price == null) continue;
      const asOf = meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      out.push({ key: sym, pricePaise: toPaise(price), asOf, source: 'yahoo' });
    } catch (e) {
      console.error(`Stock fetch failed for ${sym}:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 300)); // be gentle
  }
  return out;
}

async function main() {
  let watchlist = { stocks: [], mutualFunds: [] };
  try {
    watchlist = JSON.parse(await readFile(WATCHLIST, 'utf8'));
  } catch (e) {
    console.error('No watchlist — writing empty prices.', e.message);
  }
  // Mutual funds: ALL AMFI NAVs (matched locally by ISIN — zero config, private).
  // Stocks: still a small public watchlist of tickers (Yahoo needs per-symbol calls).
  const stocks = Array.isArray(watchlist.stocks) ? watchlist.stocks : [];

  const [mfPrices, stockPrices] = await Promise.all([fetchAllMutualFunds(), fetchStocks(stocks)]);
  const rows = [...stockPrices, ...mfPrices];

  // Compact (no indent) — this file now holds the whole AMFI NAV set.
  await writeFile(OUT, JSON.stringify(rows) + '\n', 'utf8');
  console.log(`Wrote ${rows.length} prices (${mfPrices.length} MF + ${stockPrices.length} stock) to public/data/market-prices.json`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
