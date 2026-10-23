// Integer-paise arithmetic. Keeping everything in integer paise means no
// floating-point drift: ₹21.50 is exactly 2150, always.

export type Paise = number;

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** percent% of a paise amount, rounded to the nearest paise. */
export function percentOf(paise: Paise, percent: number): Paise {
  return Math.round((paise * percent) / 100);
}

export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Add a value into a `Record<string, number>` bucket, creating the key. */
export function bump(into: Record<string, number>, key: string, delta: number): void {
  if (!delta) {
    if (!(key in into)) into[key] = 0;
    return;
  }
  into[key] = (into[key] ?? 0) + delta;
}

/** Merge record `b` into `a` (adding values). */
export function mergeInto(a: Record<string, number>, b: Record<string, number>): void {
  for (const k in b) a[k] = (a[k] ?? 0) + b[k];
}

/** Total of all values in a record. */
export function totalOf(rec: Record<string, number>): number {
  let t = 0;
  for (const k in rec) t += rec[k];
  return t;
}
