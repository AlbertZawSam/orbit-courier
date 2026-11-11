// Parses and validates knowledge/*.md. Shared by build-knowledge.mjs and the tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LEVEL_NAMES = ['beginner', 'intermediate', 'advanced'];
export const PREFIXES = ['BA', 'OR', 'MA', 'SL', 'MI', 'HZ', 'ER', 'TR', 'LV', 'TU', 'UP', 'PL', 'WM', 'TG', 'RP', 'AU'];

/** @returns {{chunks: object[], errors: string[]}} */
export function loadKnowledge(dir) {
  const chunks = [], errors = [], ids = new Set();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    const text = readFileSync(join(dir, f), 'utf8');
    for (const part of text.split(/^## /m).slice(1)) {
      const [head, ...rest] = part.split('\n');
      const m = head.match(/^\[([A-Z]{2})-(\d{3})\]\s+(.+)$/);
      if (!m) { errors.push(`${f}: bad heading "${head}"`); continue; }
      const id = `${m[1]}-${m[2]}`, title = m[3].trim();
      if (!PREFIXES.includes(m[1])) errors.push(`${id}: unknown prefix ${m[1]}`);
      if (ids.has(id)) errors.push(`${f}: duplicate id ${id}`);
      ids.add(id);
      const meta = {}, body = [];
      for (const line of rest) {
        const kv = line.match(/^(tags|levels|level):\s*(.*)$/);
        if (kv && !body.length) meta[kv[1]] = kv[2].trim(); else body.push(line);
      }
      const content = body.join('\n').trim();
      const words = content.split(/\s+/).filter(Boolean).length;
      if (!meta.tags) errors.push(`${id}: missing tags`);
      if (!LEVEL_NAMES.includes(meta.level)) errors.push(`${id}: level must be one of ${LEVEL_NAMES.join('/')}`);
      if (words > 250) errors.push(`${id}: ${words} words, over the 250 limit`);
      if (words < 30) errors.push(`${id}: only ${words} words`);
      const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
      chunks.push({ id, title, file: f, tags: list(meta.tags), levels: list(meta.levels), level: meta.level, text: content, words });
    }
  }
  return { chunks, errors };
}
