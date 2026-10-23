# Kosh — personal finance dashboard

A **private, local-first** personal finance app. All your money data lives in
your browser (IndexedDB) — nothing is uploaded, no backend, no bank passwords.

> **Phase 1 of 3 — the Foundation.** The engine, local storage, design system,
> a fully working **Overview**, **Quick add** and **Settings** are complete.
> Transactions, Expenses, Investments, People, Reimbursements and Reports are
> tidy "coming next" stubs for Phase 2/3.

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
  app/        navigation, context, snapshot hook, lookups
  pages/      Overview (live), Settings (live), stubs
  demo/       removable demo-data generator (sample content lives ONLY here)
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

## Privacy

Your records live only in this browser's IndexedDB. They are never sent
anywhere. Clearing the browser's site data removes them, so treat it as a local
notebook. Demo data is clearly tagged and removable in one click from
**Settings → Data**.
