// Browser side of the OPTIONAL AI categorisation.
//
// It sends ONLY a short description, an amount in paise, and the user's own
// category / subcategory / purpose names to the /api/ai proxy — never account
// numbers, balances, person names, references or ids. It is called only when
// the user has turned AI on, and it fails quietly: a thrown error simply means
// "no suggestions this time", and the user's data never leaves otherwise.

export interface AiSuggestItem {
  description?: string;
  amountPaise?: number;
}

export interface AiSuggestion {
  category: string;
  subcategory: string;
  purpose: string;
}

export interface AiNames {
  categories: string[];
  subcategories: string[];
  purposes: string[];
}

/** Ask the server for category suggestions. One suggestion per item, in order. */
export async function suggestCategories(items: AiSuggestItem[], names: AiNames): Promise<AiSuggestion[]> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: items.map((i) => ({ description: i.description, amountPaise: i.amountPaise })),
      categories: names.categories,
      subcategories: names.subcategories,
      purposes: names.purposes,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; suggestions?: AiSuggestion[] };
  if (!res.ok) throw new Error(data.error || `AI request failed (${res.status}).`);
  if (!Array.isArray(data.suggestions)) throw new Error('The server did not return suggestions.');
  return data.suggestions;
}
