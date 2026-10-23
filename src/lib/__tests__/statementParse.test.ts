import { describe, it, expect } from 'vitest';
import { parseAmountPaise, parseDateISO, detectColumns, rowsToParsed } from '../statementParse';

describe('statement amount parsing', () => {
  it('handles rupees, commas, parentheses and Dr/Cr', () => {
    expect(parseAmountPaise('₹1,250.50')).toBe(125050);
    expect(parseAmountPaise('(500.00)')).toBe(-50000);
    expect(parseAmountPaise('1,000.00 Dr')).toBe(-100000);
    expect(parseAmountPaise('2,000 Cr')).toBe(200000);
    expect(parseAmountPaise('-43')).toBe(-4300);
    expect(parseAmountPaise('')).toBeNull();
    expect(parseAmountPaise('   ')).toBeNull();
  });
});

describe('statement date parsing', () => {
  it('parses common formats, day-first by default', () => {
    expect(parseDateISO('2026-10-11')).toBe('2026-10-11');
    expect(parseDateISO('11/10/2026')).toBe('2026-10-11');
    expect(parseDateISO('11-10-26')).toBe('2026-10-11');
    expect(parseDateISO('01-Oct-2026')).toBe('2026-10-01');
    expect(parseDateISO('13/01/2026')).toBe('2026-01-13'); // 13 can only be a day
    expect(parseDateISO('not a date')).toBeNull();
  });
});

describe('column detection + row parsing', () => {
  it('detects a debit/credit statement layout', () => {
    const { mapping, amountMode } = detectColumns(['Date', 'Narration', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance']);
    expect(amountMode).toBe('debitCredit');
    expect(mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, balance: 4 });
  });

  it('parses debit/credit rows into signed amounts and drops noise', () => {
    const mapping = { date: 0, description: 1, debit: 2, credit: 3, balance: 4 };
    const rows = [
      ['11/10/2026', 'House rent', '28,000.00', '', '72,000.00'],
      ['11/10/2026', 'Salary', '', '90,000.00', '1,62,000.00'],
      ['', 'Opening balance brought forward', '', '', ''], // noise
    ];
    const parsed = rowsToParsed(rows, mapping, 'debitCredit');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ date: '2026-10-11', amountPaise: -2800000, balancePaise: 7200000 });
    expect(parsed[1].amountPaise).toBe(9000000);
  });
});
