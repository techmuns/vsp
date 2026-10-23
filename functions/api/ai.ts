// Kosh — the ONLY server-side code in the app.
//
// This Cloudflare Pages Function proxies an OPTIONAL, opt-in categorisation
// request to Amazon Bedrock (Converse API). It exists so the Bedrock key never
// touches the browser.
//
// Privacy contract (enforced on both ends):
//   • The browser calls this ONLY when the user has turned AI on.
//   • The request body carries nothing but a short free-text description, an
//     amount in rupees, and the user's OWN category / subcategory / purpose
//     names. Never account numbers, balances, person names, references or ids.
//   • The key is read from the environment and is never echoed back.
//
// Configure once in the Cloudflare Pages project (Settings → Environment vars):
//   BEDROCK_API_KEY    — a Bedrock API key (sent as a bearer token)
//   AWS_REGION         — e.g. ap-south-1 or us-east-1
//   BEDROCK_MODEL_IDS  — comma-separated model ids, tried in order (fallback)

interface Env {
  BEDROCK_API_KEY?: string;
  AWS_REGION?: string;
  BEDROCK_MODEL_IDS?: string;
}

interface AiItem {
  description?: string;
  amountPaise?: number;
  type?: string;
}

interface AiRequest {
  items?: AiItem[];
  categories?: string[];
  subcategories?: string[];
  purposes?: string[];
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const SYSTEM = [
  'You are a careful categoriser for a personal-finance app used in India.',
  'For each item you are given a short description and an amount in rupees.',
  'Choose the single best matching category from the provided list, and, when it clearly fits, a subcategory and a purpose — all strictly from the given lists.',
  'Never invent names. If nothing fits, use an empty string for that field.',
  'Reply with ONLY a JSON array, one object per item in the same order, each shaped {"category":"","subcategory":"","purpose":""}. No prose, no code fences.',
].join(' ');

function buildPrompt(req: AiRequest): string | null {
  const items = (req.items ?? []).filter((i) => (i.description ?? '').trim() || i.amountPaise != null);
  if (items.length === 0) return null;
  const list = (xs?: string[]) => (xs && xs.length ? xs.map((x) => `"${x}"`).join(', ') : '(none)');
  const lines = items.map((i, n) => {
    const rupees = i.amountPaise != null ? `₹${Math.round(Math.abs(i.amountPaise) / 100).toLocaleString('en-IN')}` : 'unknown amount';
    return `${n + 1}. "${(i.description ?? '').replace(/"/g, "'").slice(0, 140)}" — ${rupees}`;
  });
  return [
    `Categories: ${list(req.categories)}`,
    `Subcategories: ${list(req.subcategories)}`,
    `Purposes: ${list(req.purposes)}`,
    '',
    'Items:',
    ...lines,
  ].join('\n');
}

/** Pull a JSON array out of a model reply, tolerating code fences / stray text. */
function extractArray(text: string): Array<Record<string, string>> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    return arr.map((o) => ({
      category: String(o?.category ?? ''),
      subcategory: String(o?.subcategory ?? ''),
      purpose: String(o?.purpose ?? ''),
    }));
  } catch {
    return null;
  }
}

export const onRequestOptions: PagesFunction = () =>
  new Response(null, { headers: { Allow: 'POST, OPTIONS' } });

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const key = env.BEDROCK_API_KEY;
  const region = env.AWS_REGION || 'us-east-1';
  const models = (env.BEDROCK_MODEL_IDS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (!key || models.length === 0) {
    return json({ error: 'AI is not configured on the server.' }, 503);
  }

  let req: AiRequest;
  try {
    req = (await request.json()) as AiRequest;
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const prompt = buildPrompt(req);
  if (!prompt) return json({ error: 'Nothing to categorise.' }, 400);

  const payload = {
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 1500, temperature: 0 },
  };

  let lastError = 'No model responded.';
  for (const modelId of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(
          `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify(payload),
          }
        );

        // Transient → retry the same model; then fall through to the next.
        if (res.status === 429 || res.status >= 500) {
          lastError = `Model ${modelId} is busy (HTTP ${res.status}).`;
          continue;
        }
        if (!res.ok) {
          lastError = `Model ${modelId} returned HTTP ${res.status}.`;
          break; // non-transient → try the next model
        }

        const data = (await res.json()) as {
          output?: { message?: { content?: Array<{ text?: string }> } };
        };
        const text = (data.output?.message?.content ?? []).map((c) => c.text ?? '').join('');
        const suggestions = extractArray(text);
        if (suggestions) return json({ suggestions });
        lastError = 'The model reply could not be read.';
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  return json({ error: lastError }, 502);
};
