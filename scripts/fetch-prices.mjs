#!/usr/bin/env node
// Fetch PUBLIC market data and write three files under public/data/:
//   • market-prices.json   — latest price per instrument (ISIN for funds, SYMBOL.NS
//                             for NSE stocks). The app matches the user's own
//                             holdings against this LOCALLY, so nothing personal
//                             is ever sent anywhere.
//   • fund-directory.json   — [{ i: ISIN, n: name }] for every AMFI scheme, so the
//                             app can offer "search a fund by name" and store the
//                             ISIN itself (the user never types an ISIN).
//   • stock-directory.json  — [{ s: SYMBOL.NS, n: company }] for every NSE equity,
//                             same idea for stocks (no ticker typing).
//
// Everything here is public reference data (identifiers + prices) — this script
// never sees or touches any personal finance data. No API key is needed.
//
// Sources:
//   • Mutual-fund NAVs + names → AMFI's public NAVAll.txt
//   • Stock closes            → NSE's public full bhav-copy (sec_bhavdata_full)
//   • Stock names             → NSE's public equity master (EQUITY_L.csv)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PRICES = join(ROOT, 'public/data/market-prices.json');
const OUT_FUNDS = join(ROOT, 'public/data/fund-directory.json');
const OUT_STOCKS = join(ROOT, 'public/data/stock-directory.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 kosh-price-bot/1.0';
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** "23-Oct-2026" → "2026-10-23"; passes through an ISO date; else today. */
function normDate(s) {
  const t = (s || '').trim();
  const m = /^(\d{2})-(\w{3})-(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${MONTHS[m[2]] ?? '01'}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return new Date().toISOString().slice(0, 10);
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...(opts.headers || {}) }, ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ------------------------------------------------------------------ AMFI (funds)
// One fetch → both the price rows (keyed by ISIN) and the searchable directory.
async function fetchAmfi() {
  const prices = [];
  const directory = [];
  const seenPrice = new Set();
  const seenDir = new Set();
  try {
    const txt = await fetchText('https://www.amfiindia.com/spages/NAVAll.txt');
    for (const line of txt.split('\n')) {
      const f = line.split(';');
      if (f.length < 6) continue; // headers / section titles
      // NAV + Date are always the last two columns; the scheme name is
      // everything between the two ISIN columns and the NAV (name/plan/option).
      const navRaw = f[f.length - 2];
      const nav = Number(navRaw);
      const asOf = normDate(f[f.length - 1]);
      const name = f.slice(3, f.length - 2).map((s) => s.trim()).filter(Boolean).join(' - ');
      for (const col of [f[1], f[2]]) {
        const isin = (col || '').trim().toUpperCase();
        if (!/^INF[0-9A-Z]{9}$/.test(isin)) continue;
        if (navRaw && !isNaN(nav) && nav > 0 && !seenPrice.has(isin)) {
          seenPrice.add(isin);
          prices.push({ key: isin, pricePaise: toPaise(nav), asOf, source: 'amfi' });
        }
        if (name && !seenDir.has(isin)) {
          seenDir.add(isin);
          directory.push({ i: isin, n: name });
        }
      }
    }
  } catch (e) {
    console.error('AMFI fetch failed:', e.message);
  }
  return { prices, directory };
}

// ------------------------------------------------------------- NSE (stock names)
async function fetchNseDirectory() {
  const directory = [];
  const seen = new Set();
  try {
    const txt = await fetchText('https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv', {
      headers: { accept: 'text/csv,*/*', referer: 'https://www.nseindia.com/' },
    });
    const lines = txt.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 2) continue;
      const symbol = (cols[0] || '').trim().toUpperCase();
      const name = (cols[1] || '').trim();
      if (!/^[A-Z0-9&-]+$/.test(symbol) || !name) continue;
      const key = `${symbol}.NS`;
      if (seen.has(key)) continue;
      seen.add(key);
      directory.push({ s: key, n: name });
    }
  } catch (e) {
    console.error('NSE equity list failed:', e.message);
  }
  return directory;
}

// ------------------------------------------------------------ NSE (stock prices)
// Full bhav-copy = every NSE equity's close for a trading day, in one file.
// Walk back from today until a published copy is found (weekend / holiday safe).
async function fetchNseStockPrices() {
  const prices = [];
  const seen = new Set();
  const pad = (n) => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let back = 0; back < 7; back++) {
    const d = new Date(Date.now() - back * 86400000);
    const ddmmyyyy = `${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}`;
    const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy}.csv`;
    try {
      const txt = await fetchText(url, { headers: { accept: 'text/csv,*/*', referer: 'https://www.nseindia.com/' } });
      const lines = txt.split('\n');
      const asOf = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(',').map((x) => x.trim());
        if (c.length < 9) continue;
        const symbol = c[0].toUpperCase();
        const series = c[1];
        const close = Number(c[8]); // CLOSE_PRICE
        if (series !== 'EQ') continue; // the main equity series
        if (!/^[A-Z0-9&-]+$/.test(symbol) || !isFinite(close) || close <= 0) continue;
        const key = `${symbol}.NS`;
        if (seen.has(key)) continue;
        seen.add(key);
        prices.push({ key, pricePaise: toPaise(close), asOf, source: 'nse' });
      }
      if (prices.length) {
        console.log(`NSE bhav-copy ${ddmmyyyy}: ${prices.length} stock closes.`);
        break;
      }
    } catch {
      // not published for that date — try the previous day
    }
  }
  if (!prices.length) console.error('NSE bhav-copy: no copy found in the last 7 days.');
  return prices;
}

async function readJson(path) {
  try {
    const d = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

async function main() {
  const [amfi, stockPrices, stockDir] = await Promise.all([fetchAmfi(), fetchNseStockPrices(), fetchNseDirectory()]);

  // A source can be briefly unreachable (e.g. NSE rate-limits a CI runner). Never
  // let that wipe good committed data — carry the previous rows forward instead.
  const [prevPrices, prevFunds, prevStocks] = await Promise.all([readJson(OUT_PRICES), readJson(OUT_FUNDS), readJson(OUT_STOCKS)]);
  const fundPrices = amfi.prices.length ? amfi.prices : prevPrices.filter((r) => r.source === 'amfi');
  const stkPrices = stockPrices.length ? stockPrices : prevPrices.filter((r) => r.source === 'nse');
  const fundDir = amfi.directory.length ? amfi.directory : prevFunds;
  const stkDir = stockDir.length ? stockDir : prevStocks;
  if (!amfi.prices.length) console.error('AMFI empty — kept previous fund prices/directory.');
  if (!stockPrices.length) console.error('NSE empty — kept previous stock prices.');
  if (!stockDir.length) console.error('NSE equity list empty — kept previous stock directory.');

  // De-dupe price keys across sources (funds by ISIN, stocks by SYMBOL.NS never collide,
  // but guard anyway), funds first.
  const priceKeys = new Set();
  const rows = [];
  for (const r of [...fundPrices, ...stkPrices]) {
    if (priceKeys.has(r.key)) continue;
    priceKeys.add(r.key);
    rows.push(r);
  }

  await writeFile(OUT_PRICES, JSON.stringify(rows) + '\n', 'utf8');
  await writeFile(OUT_FUNDS, JSON.stringify(fundDir) + '\n', 'utf8');
  await writeFile(OUT_STOCKS, JSON.stringify(stkDir) + '\n', 'utf8');

  console.log(
    `Wrote ${rows.length} prices (${fundPrices.length} fund + ${stkPrices.length} stock), ` +
      `${fundDir.length} funds + ${stkDir.length} stocks in the search directory.`
  );
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
