import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { withAlpha } from '../../lib/brand';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  sortable?: boolean;
  sortValue?: (r: Row) => number | string;
  render: (r: Row, index: number) => ReactNode;
  /** heat background: return 0..1 intensity (null = none) */
  heat?: (r: Row) => number | null;
  heatColor?: string;
  headerHint?: string;
}

interface Props<Row> {
  columns: Column<Row>[];
  rows: Row[];
  getKey: (r: Row) => string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (r: Row) => void;
  activeKey?: string | null;
  maxHeight?: number;
  dense?: boolean;
  stickyHeader?: boolean;
  emptyText?: ReactNode;
}

export function Table<Row>({
  columns,
  rows,
  getKey,
  initialSort,
  onRowClick,
  activeKey,
  maxHeight,
  dense = false,
  stickyHeader = true,
  emptyText = 'Nothing to show yet.',
}: Props<Row>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort, columns]);

  const toggleSort = (c: Column<Row>) => {
    if (!c.sortable) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }));
  };

  const cellPad = dense ? 'px-2.5 py-2' : 'px-3 py-2.5';

  return (
    <div className="nice-scroll overflow-auto rounded-xl border border-line" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
          <tr className="bg-canvas text-grey">
            {columns.map((c) => {
              const isSorted = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c)}
                  className={`${cellPad} border-b border-line text-${c.align ?? 'left'} text-[10.5px] font-bold uppercase tracking-wide ${
                    c.sortable ? 'cursor-pointer select-none hover:text-slate' : ''
                  }`}
                  style={{ width: c.width }}
                  title={c.headerHint}
                >
                  <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                    {c.header}
                    {c.sortable &&
                      (isSorted ? (
                        sort!.dir === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="opacity-40" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const key = getKey(r);
            const isActive = activeKey != null && key === activeKey;
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(r)}
                className={`border-b border-line/70 transition-colors last:border-0 ${onRowClick ? 'cursor-pointer' : ''} ${
                  isActive ? 'bg-brand/[0.06]' : 'bg-white hover:bg-canvas'
                }`}
              >
                {columns.map((c) => {
                  const t = c.heat?.(r);
                  const bg = t != null ? withAlpha(c.heatColor ?? '#6366F1', 0.08 + 0.42 * Math.max(0, Math.min(1, t))) : undefined;
                  return (
                    <td
                      key={c.key}
                      className={`${cellPad} text-${c.align ?? 'left'} align-middle`}
                      style={bg ? { background: bg } : undefined}
                    >
                      {c.render(r, i)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-[12.5px] text-muted">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
