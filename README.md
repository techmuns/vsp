# Kosh — personal finance dashboard

A **private, local-first** personal finance app. All your money data lives in
your browser (IndexedDB) — nothing is uploaded, no backend, no bank passwords.

> **Phases 1 & 2 are live.** Phase 1 built the foundation (engine, local
> storage, design system, Overview, Quick-add, Settings). Phase 2 adds the five
> everyday modules — **Transactions**, **Expenses**, **People**,
> **Reimbursements** and **Investments** — plus a full transaction editor and an
> optional public price feed. **Reports** (with statement import & reconciliation)
> is the Phase 3 stub.

## Highlights

- **Simple outside, powerful inside.** A normal transaction takes a few seconds
  to add; advanced options stay hidden until needed. No accounting jargon —
  never "debit / credit / journal".
- **Visual-first.** Colourful SVG charts (no chart library) with rich hover
  tooltips, consistent money-concept colours, and empty states instead of fake
  numbers.
- **Nothing hardcoded.** Accounts, categories, purposes, people, policies,
  investments, salary day, start date — everything is data you create and edit.
  Example names/amounts only ever appear as editable seeds or inside the
  removable demo-data generator.
- **Correct by construction.** All amounts are stored as **integer paise** (no
  floating-point drift). A pure, unit-tested engine computes balances, net
  worth, flows, reimbursements, receivables and the portfolio.

## Stack

Vite · React 18 · TypeScript · Tailwind 3 · lucide-react · Dexie (IndexedDB) ·
xlsx · Vitest.

```
src/
  lib/        brand (colour system), format (paise/₹/dates), chartMath, dates
  components/ ui/ (Card, Controls, Table, Tabs), charts/ (SVG kit), Shell, QuickAdd …
  db/         Dexie schema, types, repo (data access), liveQuery hooks
  engine/     pure finance engine (txn-type registry, classify, portfolio, compute) + tests
  app/        navigation, context, snapshot hook, lookups, market feed, filters
  pages/      Overview, Transactions, Expenses, People, Reimbursements,
              Investments, Settings (all live) + Reports (Phase 3 stub)
  components/ … + editor/ (full transaction editor), quickadd/ (shared bits)
  demo/       removable demo-data generator (sample content lives ONLY here)
scripts/      fetch-prices.mjs — the public price-feed fetcher (runs in CI only)
```

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # run the Vitest engine suite
npm run build      # type-check (tsc) + production build → dist/
```

## Deploy — Cloudflare Pages (one-time setup, then automatic)

The repo is Pages-ready: a static SPA that builds to `dist/`, with
`public/_redirects` (`/* /index.html 200`) for client-side routing and a
relative asset base.

Connect it once and **every push to the default branch auto-deploys** — no
manual steps afterwards:

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick this repository and authorise the Cloudflare GitHub app.
3. Build settings:
   - **Framework preset:** Vite (or None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Save & Deploy.

That's it — from then on it deploys itself on every push.

## Optional live price feed (public data only)

Investment prices can refresh automatically — fully isolated from your private
data. A scheduled GitHub Action reads **`public/data/watchlist.json`** (stock
symbols + mutual-fund ISINs only — no holdings, units or amounts), fetches
mutual-fund NAVs from AMFI and stock quotes from a public source, and commits
**`public/data/market-prices.json`**. The app loads that file at startup, merges
it with your manual prices (newest date wins; manual always overrides), and
works perfectly offline without it.

One-time setup:

1. Edit `public/data/watchlist.json` to list the symbols/ISINs of your holdings
   (set each investment's symbol/ISIN in **Settings → Investments**, matching
   format — Yahoo symbols like `RELIANCE.NS`, AMFI ISINs like `INF…`).
2. The workflow (`.github/workflows/prices.yml`) runs weekday evenings and on
   manual dispatch. **AMFI and the default stock source need no secrets.** If
   you switch to a stock API that needs a key, add it as a repo secret and read
   it from `process.env` in `scripts/fetch-prices.mjs` — never hardcode it.

## Privacy

Your records live only in this browser's IndexedDB. They are never sent
anywhere. Clearing the browser's site data removes them, so treat it as a local
notebook. Demo data is clearly tagged and removable in one click from
**Settings → Data**.
