import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { RANGE_PRESETS, type DateRange, type RangePreset } from '../lib/dates';
import { fmtRange } from '../lib/format';
import { DateField } from './ui/Controls';

export function DateRangePicker({
  preset,
  range,
  custom,
  onPreset,
  onCustom,
}: {
  preset: RangePreset;
  range: DateRange;
  custom: DateRange;
  onPreset: (p: RangePreset) => void;
  onCustom: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(custom);
  const ref = useRef<HTMLDivElement>(null);
  const label = RANGE_PRESETS.find((p) => p.key === preset)?.label ?? 'Range';

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => setDraft(custom), [custom]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left shadow-sm transition hover:border-brand/40 focus-ring"
      >
        <CalendarRange size={16} className="shrink-0 text-brand" />
        <span className="min-w-0">
          <span className="block text-[12.5px] font-bold leading-tight text-ink">{label}</span>
          <span className="tnum block text-[10.5px] leading-tight text-grey">{fmtRange(range.from, range.to)}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-grey transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-[260px] overflow-hidden rounded-xl border border-line bg-white shadow-pop anim-fade">
          <div className="py-1">
            {RANGE_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  onPreset(p.key);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition hover:bg-canvas ${
                  preset === p.key ? 'font-bold text-brand' : 'font-medium text-slate'
                }`}
              >
                {p.label}
                {preset === p.key && <Check size={15} className="text-brand" />}
              </button>
            ))}
          </div>
          <div className="border-t border-line bg-canvas/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-grey">Custom range</span>
              {preset === 'custom' && <Check size={14} className="text-brand" />}
            </div>
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-grey">From</span>
                <DateField value={draft.from} max={draft.to} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-grey">To</span>
                <DateField value={draft.to} min={draft.from} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
              </label>
            </div>
            <button
              onClick={() => {
                if (draft.from && draft.to && draft.from <= draft.to) {
                  onCustom(draft);
                  onPreset('custom');
                  setOpen(false);
                }
              }}
              className="mt-2 w-full rounded-lg bg-brand-gradient py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-95 focus-ring"
            >
              Apply custom range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
