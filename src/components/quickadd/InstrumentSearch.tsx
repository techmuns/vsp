import { useMemo, useState } from 'react';
import { Search, Loader2, TrendingUp } from 'lucide-react';
import { useInstrumentDirectory, searchInstruments, type InstrumentHit } from '../../app/directory';
import { fmtINR } from '../../lib/format';

/**
 * Type-ahead search over the public fund / stock directory. The user types the
 * name they know; picking a result hands back the ISIN (fund) or ticker (stock)
 * so the caller can store it and get a live price — no code to look up by hand.
 */
export function InstrumentSearch({ kind, onPick, autoFocus }: { kind: 'fund' | 'stock'; onPick: (hit: InstrumentHit) => void; autoFocus?: boolean }) {
  const { loaded, error, dir } = useInstrumentDirectory();
  const [q, setQ] = useState('');
  const results = useMemo(() => searchInstruments(dir, kind, q), [dir, kind, q]);
  const typed = q.trim().length >= 2;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-grey" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={kind === 'fund' ? 'Search your mutual fund by name…' : 'Search a stock by name…'}
          className="w-full rounded-xl border border-line bg-white py-2 pl-8 pr-3 text-[13px] text-ink outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
        />
      </div>

      {!loaded && typed && (
        <div className="flex items-center gap-1.5 px-1 text-[11.5px] text-grey">
          <Loader2 size={12} className="animate-spin" /> Loading the list…
        </div>
      )}
      {loaded && error && <p className="px-1 text-[11.5px] text-money-out">Couldn't load the list right now — you can enter the name manually below.</p>}
      {loaded && !error && typed && results.length === 0 && <p className="px-1 text-[11.5px] text-muted">No match — check the spelling, or enter it manually below.</p>}

      {results.length > 0 && (
        <div className="nice-scroll max-h-56 overflow-y-auto rounded-xl border border-line">
          {results.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onPick(h)}
              className="flex w-full items-center gap-2 border-b border-line/70 px-3 py-2 text-left last:border-0 hover:bg-canvas focus-ring"
            >
              <TrendingUp size={13} className="shrink-0 text-money-invest" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-ink">{h.name}</div>
                <div className="text-[10.5px] text-grey">{h.kind === 'fund' ? h.id : `${h.id.replace('.NS', '')} · NSE`}</div>
              </div>
              {h.pricePaise != null && (
                <div className="shrink-0 text-right">
                  <div className="tnum text-[11.5px] font-semibold text-ink">{fmtINR(h.pricePaise)}</div>
                  <div className="text-[9.5px] uppercase tracking-wide text-grey">{h.kind === 'fund' ? 'NAV' : 'price'}</div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
