export interface PeriodFigures {
  incomePaise: number;
  expensePaise: number;
  savingsRate: number | null;
  expenseByCategory: Record<string, number>;
}

function topCategory(byCat: Record<string, number>): { id: string; value: number } | null {
  let best: { id: string; value: number } | null = null;
  for (const id in byCat) if (byCat[id] > 0 && (!best || byCat[id] > best.value)) best = { id, value: byCat[id] };
  return best;
}

/** Up to three short, plain-language insights comparing two periods. */
export function periodInsights(cur: PeriodFigures, prev: PeriodFigures | null, nameOf: (catId: string) => string): string[] {
  const out: string[] = [];
  const top = topCategory(cur.expenseByCategory);

  if (prev && prev.expensePaise > 0 && cur.expensePaise > 0) {
    const delta = ((cur.expensePaise - prev.expensePaise) / prev.expensePaise) * 100;
    if (Math.abs(delta) >= 5) {
      const where = top ? `, mostly on ${nameOf(top.id) || 'uncategorised'}` : '';
      out.push(`You spent ${Math.abs(delta).toFixed(0)}% ${delta > 0 ? 'more' : 'less'} than the previous period${where}.`);
    }
  } else if (top) {
    out.push(`Your biggest spend was on ${nameOf(top.id) || 'uncategorised'}.`);
  }

  if (cur.savingsRate != null && cur.incomePaise > 0) {
    if (cur.savingsRate >= 20) out.push(`You saved ${cur.savingsRate.toFixed(0)}% of your income — a healthy rate.`);
    else if (cur.savingsRate >= 0) out.push(`You saved ${cur.savingsRate.toFixed(0)}% of your income this period.`);
    else out.push(`You spent more than you earned this period.`);
  }

  if (prev && prev.incomePaise > 0 && cur.incomePaise > 0) {
    const d = ((cur.incomePaise - prev.incomePaise) / prev.incomePaise) * 100;
    if (Math.abs(d) >= 10) out.push(`Income was ${Math.abs(d).toFixed(0)}% ${d > 0 ? 'higher' : 'lower'} than the previous period.`);
  }

  return out.slice(0, 3);
}
