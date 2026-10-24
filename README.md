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

## Live price feed (public data only, zero config)

Investment prices refresh automatically — fully isolated from your private data,
and with nothing to set up per holding. A scheduled GitHub Action publishes three
public reference files under `public/data/`:

- **`market-prices.json`** — the latest price of *every* AMFI mutual fund (by
  ISIN) and *every* NSE stock (by `SYMBOL.NS`).
- **`fund-directory.json`** / **`stock-directory.json`** — name → ISIN / ticker,
  so the app lets you **search a fund or stock by name** and stores the
  identifier for you. You never look up an ISIN or ticker by hand.

The app matches *your* holdings against these files **locally in the browser**,
so your holdings, units and amounts are never listed anywhere public. It merges
the feed with any manual prices (newest date wins; manual always overrides) and
works perfectly offline without it.

How to use it: when you add an investment (or from **Investments → Prices**),
search the fund/stock by name and pick it — the live price then updates on its
own. No per-holding configuration is required.

Sources (all public, no secrets): mutual-fund NAVs + names from **AMFI**, stock
closes + names from **NSE**'s public bhav-copy and equity list. The workflow
(`.github/workflows/prices.yml`) runs weekday evenings and on manual dispatch;
if a source is briefly unreachable it keeps the last good data rather than
clearing it.

## Privacy

Your records live only in this browser's IndexedDB. They are never sent
anywhere. Clearing the browser's site data removes them, so treat it as a local
notebook. Demo data is clearly tagged and removable in one click from
**Settings → Data**.
