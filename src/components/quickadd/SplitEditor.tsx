import { Plus, Trash2 } from 'lucide-react';
import { MONEY } from '../../lib/brand';
import { fmtINR } from '../../lib/format';
import { AmountField, Dropdown, type Option } from '../ui/Controls';

export interface SplitRow {
  amountPaise: number | null;
  categoryId?: string;
  personId?: string;
  reimbursable?: boolean;
}

/** Compact split editor: lines of amount + (category OR person), with a live
 *  remainder that must reach zero before the parent can be saved. */
export function SplitEditor({
  rows,
  categoryOpts,
  personOpts,
  remainder,
  onChange,
}: {
  rows: SplitRow[];
  categoryOpts: Option[];
  personOpts: Option[];
  remainder: number;
  onChange: (rows: SplitRow[]) => void;
}) {
  const update = (i: number, patch: Partial<SplitRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="mt-3 space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-28 shrink-0">
            <AmountField paise={r.amountPaise} onPaise={(p) => update(i, { amountPaise: p })} />
          </div>
          <div className="min-w-0 flex-1">
            <Dropdown
              value={r.personId ? `p:${r.personId}` : r.categoryId ?? ''}
              options={[
                ...categoryOpts.map((o) => ({ ...o })),
                ...personOpts.map((o) => ({ value: `p:${o.value}`, label: `For ${o.label}`, color: MONEY.receivable })),
              ]}
              onChange={(v) => (v.startsWith('p:') ? update(i, { personId: v.slice(2), categoryId: undefined }) : update(i, { categoryId: v, personId: undefined }))}
              placeholder="Category / person"
              size="sm"
              width="100%"
            />
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-grey hover:text-money-out"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange([...rows, { amountPaise: remainder > 0 ? remainder : null }])}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand"
        >
          <Plus size={14} /> Add part
        </button>
        <span className={`tnum text-[11.5px] font-medium ${remainder === 0 ? 'text-money-save' : 'text-grey'}`}>
          {remainder === 0 ? 'Balanced' : `${fmtINR(remainder)} left`}
        </span>
      </div>
    </div>
  );
}
