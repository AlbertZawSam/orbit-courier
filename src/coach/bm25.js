import { tokenize } from './tokenize.js';

export const K1 = 1.5, B = 0.75;
export const TITLE_WEIGHT = 3, TAG_WEIGHT = 2;

/** BM25 over chunks, with title tokens counted 3x and tag tokens 2x. */
export function createIndex(chunks) {
  const docs = chunks.map((c) => {
    const tf = new Map();
    const add = (tokens, w) => { for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + w); };
    add(tokenize(c.title), TITLE_WEIGHT);
    add(tokenize(c.tags.join(' ')), TAG_WEIGHT);
    add(tokenize(c.text), 1);
    let len = 0; for (const v of tf.values()) len += v;
    return { chunk: c, tf, len };
  });
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const idf = (t) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));

  return {
    size: N,
    /** Score every chunk for the query tokens. Returns [{chunk, score}] sorted high to low (zeros removed). */
    search(queryTokens) {
      const uniq = [...new Set(queryTokens)];
      const out = [];
      for (const d of docs) {
        let score = 0;
        for (const t of uniq) {
          const f = d.tf.get(t);
          if (!f) continue;
          score += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / avgdl)));
        }
        if (score > 0) out.push({ chunk: d.chunk, score });
      }
      return out.sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
    },
  };
}
