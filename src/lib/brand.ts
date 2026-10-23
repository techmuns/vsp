// Kosh brand kit + the ONE fixed colour per money concept, reused identically
// across every chart, table and card. This is a design theme — never data.

/** Money-concept colours. One concept → one colour, everywhere. */
export const MONEY = {
  in: '#10B981', // income / money in — emerald
  out: '#F43F5E', // spending / expense — rose
  invest: '#7C3AED', // investments — violet
  save: '#14B8A6', // savings — teal
  receivable: '#F59E0B', // owed TO you — amber
  payable: '#FB923C', // you OWE — orange
  reimb: '#0EA5E9', // reimbursements — sky
  card: '#D946EF', // credit card — fuchsia
  transfer: '#64748B', // transfer / neutral — slate
  net: '#6366F1', // net worth / brand — indigo
} as const;

/** Neutral ink / surface scale. */
export const INK = {
  ink: '#0F172A',
  slate: '#334155',
  grey: '#64748B',
  muted: '#94A3B8',
  line: '#E7EAF0',
  canvas: '#F7F8FB',
  white: '#FFFFFF',
} as const;

export const BRAND = {
  indigo: '#6366F1',
  violet: '#7C3AED',
  pink: '#EC4899',
} as const;

/** The brand gradient used on headers, the logo mark and active nav. */
export const BRAND_GRADIENT = 'linear-gradient(135deg, #6366F1 0%, #7C3AED 52%, #EC4899 100%)';

/**
 * A stable, varied categorical palette. Categories are assigned a colour
 * DYNAMICALLY by their id (hashed → round-robin), so every category the user
 * creates gets one consistent colour everywhere — no hardcoded category→colour map.
 */
export const CATEGORY_PALETTE = [
  '#6366F1', // indigo
  '#F43F5E', // rose
  '#F59E0B', // amber
  '#10B981', // emerald
  '#0EA5E9', // sky
  '#7C3AED', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#8B5CF6', // purple
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#EF4444', // red
  '#3B82F6', // blue
  '#D946EF', // fuchsia
  '#22C55E', // green
  '#EAB308', // yellow
  '#A855F7', // purple-2
] as const;

/** Deterministic string hash (FNV-1a-ish). */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The stable colour for a category/anything-with-an-id. Same id → same colour,
 * forever, across every screen. Deactivating/renaming never changes it.
 */
export function colorForId(id: string | null | undefined, palette: readonly string[] = CATEGORY_PALETTE): string {
  if (!id) return INK.muted;
  return palette[hashString(id) % palette.length];
}

/** Lighten (amt>0) / darken (amt<0) a hex colour, factor −1..1. */
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)));
  const to2 = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

/** Hex → rgba string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
