// Indian-style number, currency & date formatting. Plain language, no jargon.
//
// MONEY RULE: every amount in the app is stored and passed around as INTEGER
// PAISE (1 rupee = 100 paise) so there are never floating-point rounding
// errors. We convert to rupees ONLY here, at the display edge.

const PAISE_PER_RUPEE = 100;
const L = 1e5; // one lakh (rupees)
const CR = 1e7; // one crore (rupees)

/** Rupees (a real number) → integer paise. Use at input edges. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/** Integer paise → rupees (a real number). Use only for maths at the edge. */
export function toRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

interface InrOpts {
  /** Force a fixed number of decimals. Default: 2 only when there are paise. */
  decimals?: number;
  /** Prefix a sign for positive values too (e.g. +₹500). */
  signed?: boolean;
  /** Drop the ₹ symbol. */
  bare?: boolean;
}

/**
 * Full rupee amount with Indian digit grouping, from paise.
 *   250000  → ₹2,500        5000000 → ₹50,000
 *   2150    → ₹21.50        -4300   → -₹43
 */
export function fmtINR(paise: number | null | undefined, opts: InrOpts = {}): string {
  if (paise == null || !isFinite(paise)) return '—';
  const rupees = toRupees(Math.abs(paise));
  const hasPaise = Math.round(Math.abs(paise)) % PAISE_PER_RUPEE !== 0;
  const decimals = opts.decimals ?? (hasPaise ? 2 : 0);
  const body = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const symbol = opts.bare ? '' : '₹';
  const neg = paise < 0;
  const sign = neg ? '-' : opts.signed ? '+' : '';
  return `${sign}${symbol}${body}`;
}

/**
 * Compact money for big roll-ups only (net worth, portfolio value):
 *   ₹1.25 Cr · ₹3.40 L · else falls back to full rupees.
 */
export function fmtCompact(paise: number | null | undefined, opts: InrOpts = {}): string {
  if (paise == null || !isFinite(paise)) return '—';
  const rupees = toRupees(Math.abs(paise));
  const neg = paise < 0;
  const sign = neg ? '-' : opts.signed ? '+' : '';
  if (rupees >= CR) return `${sign}₹${(rupees / CR).toFixed(2)} Cr`;
  if (rupees >= L) return `${sign}₹${(rupees / L).toFixed(2)} L`;
  return fmtINR(paise, opts);
}

/** A signed amount, always showing + or −. */
export function fmtSigned(paise: number | null | undefined): string {
  return fmtINR(paise, { signed: true });
}

/** Short, rounded money for chart axes: ₹46K · ₹1.1L · ₹2.3Cr · ₹430. */
export function fmtAxis(paise: number | null | undefined): string {
  if (paise == null || !isFinite(paise)) return '';
  const r = toRupees(Math.abs(paise));
  const sign = paise < 0 ? '-' : '';
  if (r >= CR) return `${sign}₹${(r / CR).toFixed(r >= 10 * CR ? 0 : 1)}Cr`;
  if (r >= L) return `${sign}₹${(r / L).toFixed(r >= 10 * L ? 0 : 1)}L`;
  if (r >= 1000) return `${sign}₹${Math.round(r / 1000)}K`;
  return `${sign}₹${Math.round(r)}`;
}

/** Percentage, e.g. 42.0% */
export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

/** Plain number with Indian grouping. */
export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Units of an investment (e.g. 12.5 units). Trims trailing zeros. */
export function fmtUnits(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 4 });
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function asDate(d: string | Date): Date {
  return d instanceof Date ? d : new Date(d);
}

/** "2026-10-11" → "11 Oct 2026" */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = asDate(d);
  if (isNaN(dt.getTime())) return String(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** "2026-10-11" → "11 Oct" (no year — for dense charts/rows). */
export function fmtDayMonth(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = asDate(d);
  if (isNaN(dt.getTime())) return String(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}

/** A Date or "2026-10" → "Oct '26" */
export function fmtMonth(d: string | Date): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}$/.test(d)) {
    const [y, mm] = d.split('-');
    return `${MONTHS[parseInt(mm, 10) - 1] ?? mm} '${y.slice(2)}`;
  }
  const dt = asDate(d);
  if (isNaN(dt.getTime())) return String(d);
  return `${MONTHS[dt.getMonth()]} '${String(dt.getFullYear()).slice(2)}`;
}

/** A compact range label: "11 Oct – 10 Nov 2026" */
export function fmtRange(from: string | Date, to: string | Date): string {
  const a = asDate(from);
  const b = asDate(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '—';
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = sameYear ? fmtDayMonth(a) : fmtDate(a);
  return `${left} – ${fmtDate(b)}`;
}

/** Relative-ish day label used in lists: Today / Yesterday / 11 Oct 2026. */
export function fmtDateFriendly(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = asDate(d);
  if (isNaN(dt.getTime())) return String(d);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(dt)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return fmtDate(dt);
}
