import { describe, it, expect } from 'vitest';
import { fmtINR, fmtCompact, toPaise, toRupees } from '../format';

describe('money formatting (integer paise, Indian grouping)', () => {
  it('shows whole rupees with Indian digit grouping', () => {
    expect(fmtINR(toPaise(125000))).toBe('₹1,25,000');
    expect(fmtINR(toPaise(43))).toBe('₹43');
    expect(fmtINR(0)).toBe('₹0');
  });

  it('shows paise only when present, exactly (no float drift)', () => {
    expect(fmtINR(2150)).toBe('₹21.50');
    expect(fmtINR(4300)).toBe('₹43');
    // 10% of ₹43 twice should stay exact in paise
    const tenPct = Math.round(4300 * 0.1);
    expect(tenPct + tenPct).toBe(860);
    expect(fmtINR(860)).toBe('₹8.60');
  });

  it('signs negatives', () => {
    expect(fmtINR(-4300)).toBe('-₹43');
    expect(fmtINR(50000, { signed: true })).toBe('+₹500');
  });

  it('compact form only kicks in for lakhs and crores', () => {
    expect(fmtCompact(toPaise(1_25_000))).toBe('₹1.25 L');
    expect(fmtCompact(toPaise(2_50_00_000))).toBe('₹2.50 Cr');
    expect(fmtCompact(toPaise(4300))).toBe('₹4,300');
  });

  it('round-trips rupees ↔ paise', () => {
    expect(toPaise(21.5)).toBe(2150);
    expect(toRupees(2150)).toBe(21.5);
  });
});
