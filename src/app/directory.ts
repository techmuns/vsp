import { useEffect, useState } from 'react';

/**
 * The searchable instrument directory: fund name -> ISIN, stock name -> ticker.
 * Published daily next to the price feed (public reference data only). It is
 * matched LOCALLY so the user searches by the name they know and never has to
 * find an ISIN or a Yahoo/NSE symbol by hand.
 *
 * Both files are a bit large (all of AMFI + NSE), so they are loaded lazily —
 * only once, and only when a search UI first mounts — then cached in-module.
 */
export interface InstrumentHit {
  kind: 'fund' | 'stock';
  id: string; // ISIN for a fund, SYMBOL.NS for a stock
  name: string;
}

interface Directory {
  funds: { i: string; n: string }[];
  stocks: { s: string; n: string }[];
}

let cache: Directory | null = null;
let inflight: Promise<Directory> | null = null;

async function fetchJson(url: string): Promise<unknown[]> {
  try {
    const r = await fetch(url, { cache: 'force-cache' });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

function loadDirectory(): Promise<Directory> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  const base = import.meta.env.BASE_URL;
  inflight = Promise.all([fetchJson(`${base}data/fund-directory.json`), fetchJson(`${base}data/stock-directory.json`)]).then(
    ([funds, stocks]) => {
      cache = { funds: funds as Directory['funds'], stocks: stocks as Directory['stocks'] };
      return cache;
    }
  );
  return inflight;
}

export interface DirectoryState {
  loaded: boolean;
  error: boolean;
  dir: Directory | null;
}

export function useInstrumentDirectory(): DirectoryState {
  const [state, setState] = useState<DirectoryState>(() => (cache ? { loaded: true, error: false, dir: cache } : { loaded: false, error: false, dir: null }));
  useEffect(() => {
    if (cache) {
      setState({ loaded: true, error: false, dir: cache });
      return;
    }
    let alive = true;
    loadDirectory()
      .then((d) => {
        if (alive) setState({ loaded: true, error: d.funds.length === 0 && d.stocks.length === 0, dir: d });
      })
      .catch(() => {
        if (alive) setState({ loaded: true, error: true, dir: null });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Name search: every typed word must appear; exact/prefix matches rank first. */
export function searchInstruments(dir: Directory | null, kind: 'fund' | 'stock', query: string, limit = 25): InstrumentHit[] {
  if (!dir) return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const src = kind === 'fund' ? dir.funds : dir.stocks;
  const hits: { h: InstrumentHit; score: number }[] = [];
  for (const row of src) {
    const name = kind === 'fund' ? (row as { n: string }).n : (row as { n: string }).n;
    const id = kind === 'fund' ? (row as { i: string }).i : (row as { s: string }).s;
    const lname = name.toLowerCase();
    let ok = true;
    for (const w of words) {
      if (!lname.includes(w)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const score = lname.startsWith(q) ? 3 : lname.includes(` ${q}`) ? 2 : 1;
    hits.push({ h: { kind, id, name }, score });
  }
  hits.sort((a, b) => b.score - a.score || a.h.name.length - b.h.name.length);
  return hits.slice(0, limit).map((x) => x.h);
}
