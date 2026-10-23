// Pure parsing helpers for statement import — robust to messy bank formats.
// The actual file reading (xlsx / PDF) is lazy-loaded elsewhere; this module is
// framework-free and unit-tested.
import type { ColumnMapping } from '../db/types';
import type { ParsedRow } from '../engine/reconcile';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse a messy money cell → signed integer paise, or null. Handles ₹, commas,
 *  (parentheses) negatives, and Dr/Cr suffixes. */
export function parseAmountPaise(raw: unknown): number | null {
  let str = String(raw ?? '').trim();
  if (!str) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(str)) {
    sign = -1;
    str = str.slice(1, -1);
  }
  const low = str.toLowerCase();
  if (/(^|\s)dr$|\bdr\b|debit/.test(low)) sign = -1;
  else if (/(^|\s)cr$|\bcr\b|credit/.test(low)) sign = 1;
  let cleaned = str.replace(/[₹$,]/g, '').replace(/[a-zA-Z]/g, '').replace(/\s/g, '');
  if (cleaned.startsWith('-')) {
    sign = -1;
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned === '' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  if (!isFinite(n)) return null;
  return sign * Math.round(Math.abs(n) * 100);
}

function yr(y: number): number {
  return y < 100 ? 2000 + y : y;
}
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parse a date cell → 'YYYY-MM-DD', or null. Day-first by default (India). */
export function parseDateISO(raw: unknown, prefer: 'DMY' | 'MDY' = 'DMY'): string | null {
  const str = String(raw ?? '').trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(str);
  if (m) {
    let a = +m[1];
    let b = +m[2];
    const y = yr(+m[3]);
    let day: number, mon: number;
    if (a > 12) { day = a; mon = b; }
    else if (b > 12) { mon = a; day = b; }
    else if (prefer === 'MDY') { mon = a; day = b; }
    else { day = a; mon = b; }
    return iso(y, mon, day);
  }
  // 01-Oct-2026 / 1 Oct 26 / 01 October 2026
  m = /^(\d{1,2})[\s\-]([A-Za-z]{3,})[\s\-,]*(\d{2,4})$/.exec(str);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return iso(yr(+m[3]), mon, +m[1]);
  }
  // Oct 1, 2026
  m = /^([A-Za-z]{3,})[\s\-](\d{1,2})[\s\-,]+(\d{2,4})$/.exec(str);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return iso(yr(+m[3]), mon, +m[2]);
  }
  return null;
}

const find = (headers: string[], keywords: string[]): number | undefined => {
  const i = headers.findIndex((h) => keywords.some((k) => h.toLowerCase().includes(k)));
  return i >= 0 ? i : undefined;
};

/** Guess the column mapping from headers (any bank — keyword based). */
export function detectColumns(headers: string[]): { mapping: ColumnMapping; amountMode: 'single' | 'debitCredit' } {
  const mapping: ColumnMapping = {
    date: find(headers, ['date']),
    description: find(headers, ['description', 'narration', 'particular', 'detail', 'remark', 'transaction remarks']),
    debit: find(headers, ['debit', 'withdrawal', 'paid out', 'dr amount', 'withdrawal amt']),
    credit: find(headers, ['credit', 'deposit', 'paid in', 'cr amount', 'deposit amt']),
    amount: find(headers, ['amount', 'amt']),
    balance: find(headers, ['balance']),
    reference: find(headers, ['ref', 'cheque', 'chq', 'utr', 'transaction id']),
  };
  const amountMode: 'single' | 'debitCredit' = mapping.debit != null && mapping.credit != null ? 'debitCredit' : 'single';
  return { mapping, amountMode };
}

/** Turn raw cell rows into parsed statement rows, dropping obvious noise. */
export function rowsToParsed(rows: string[][], mapping: ColumnMapping, amountMode: 'single' | 'debitCredit', prefer: 'DMY' | 'MDY' = 'DMY'): ParsedRow[] {
  const out: ParsedRow[] = [];
  const at = (row: string[], idx?: number) => (idx != null ? row[idx] : undefined);
  for (const row of rows) {
    const date = parseDateISO(at(row, mapping.date), prefer);
    let amountPaise: number;
    if (amountMode === 'debitCredit') {
      const d = parseAmountPaise(at(row, mapping.debit));
      const c = parseAmountPaise(at(row, mapping.credit));
      amountPaise = (c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0);
    } else {
      amountPaise = parseAmountPaise(at(row, mapping.amount)) ?? 0;
    }
    if (!date && amountPaise === 0) continue; // header/footer/noise
    out.push({
      date: date ?? '',
      description: String(at(row, mapping.description) ?? '').trim(),
      amountPaise,
      balancePaise: mapping.balance != null ? parseAmountPaise(at(row, mapping.balance)) ?? undefined : undefined,
      reference: mapping.reference != null ? String(at(row, mapping.reference) ?? '').trim() || undefined : undefined,
      raw: row,
    });
  }
  return out;
}

/** A sensible ICICI-style default mapping (debit/credit layout). */
export const ICICI_DEFAULT: { mapping: ColumnMapping; amountMode: 'single' | 'debitCredit' } = {
  mapping: { date: 0, reference: 1, description: 2, debit: 3, credit: 4, balance: 5 },
  amountMode: 'debitCredit',
};
