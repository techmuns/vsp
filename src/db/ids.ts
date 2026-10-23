/** Stable unique ids. Short, URL-safe, time-ordered-ish. */
export function newId(prefix = ''): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid = g.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const short = uuid.replace(/-/g, '').slice(0, 20);
  return prefix ? `${prefix}_${short}` : short;
}

export const nowTs = (): number => Date.now();

/** Today's date as 'YYYY-MM-DD' in local time. */
export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
