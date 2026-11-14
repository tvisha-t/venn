import { env } from "./env";

export const EMBED_DIM = 1024;

/** Text used to embed a profile. Public fields only — never contact data. */
export function profileEmbedText(p: {
  job_title?: string | null; employer?: string | null; industry?: string | null; major?: string | null;
  degree?: string | null; gt_programs?: string[] | null; cs_threads?: string[] | null; activities?: string[] | null;
  open_to?: string[] | null; interests?: string[] | null; summary?: string | null; city?: string | null; roles?: string[] | null;
}): string {
  return [
    p.job_title, p.employer, p.industry, p.major, p.degree, p.city,
    ...(p.roles ?? []), ...(p.gt_programs ?? []), ...(p.cs_threads ?? []), ...(p.activities ?? []),
    ...(p.open_to ?? []), ...(p.interests ?? []), p.summary?.slice(0, 300),
  ].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------- local hashing embedder
const STOP = new Set("a an the and or of to in at for on with who what i im i'm my me we our is are be want need looking find someone people gt georgia tech yellow jackets could would can like into from as by that this".split(" "));

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#& ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Signed feature hashing of unigrams, bigrams and char trigrams into 1024 dims, L2-normalized. */
export function hashEmbed(text: string): number[] {
  const v = new Float64Array(EMBED_DIM);
  const toks = tokens(text);
  const add = (feat: string, w: number) => {
    const h = fnv(feat);
    v[h % EMBED_DIM] += (h & 0x80000000 ? -1 : 1) * w;
  };
  toks.forEach((t, i) => {
    add(`u:${t}`, 1);
    if (i > 0) add(`b:${toks[i - 1]}_${t}`, 0.7);
    if (t.length >= 5) for (let j = 0; j + 3 <= t.length; j++) add(`c:${t.slice(j, j + 3)}`, 0.15);
  });
  const norm = Math.hypot(...v) || 1;
  return Array.from(v, (x) => x / norm);
}

// ---------------------------------------------------------------- Voyage (optional)
async function voyageEmbed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.voyageKey}` },
    body: JSON.stringify({ input: texts, model: "voyage-3.5", input_type: inputType, output_dimension: EMBED_DIM }),
  });
  if (!res.ok) throw new Error(`voyage ${res.status}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export function embedderName(): string {
  return env.voyageKey ? "voyage-3.5" : "local-hash-1024";
}

export async function embedMany(texts: string[], inputType: "document" | "query" = "document"): Promise<number[][]> {
  if (env.voyageKey) {
    try {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 128) out.push(...(await voyageEmbed(texts.slice(i, i + 128), inputType)));
      return out;
    } catch (e) {
      console.warn("[embed] Voyage failed, using local embedder:", (e as Error).message);
    }
  }
  return texts.map(hashEmbed);
}

export async function embedOne(text: string, inputType: "document" | "query" = "query"): Promise<number[]> {
  return (await embedMany([text], inputType))[0];
}

export function toPgVector(v: number[]): string {
  return `[${v.map((x) => x.toFixed(6)).join(",")}]`;
}
