// Builds src/coach/kb.generated.json from knowledge/*.md. Validation grows with the knowledge base (stage 5).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../knowledge/', import.meta.url).pathname;
const out = new URL('../src/coach/kb.generated.json', import.meta.url).pathname;
const chunks = [];
const ids = new Set();
const errors = [];

for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
  const text = readFileSync(join(dir, f), 'utf8');
  for (const part of text.split(/^## /m).slice(1)) {
    const [head, ...rest] = part.split('\n');
    const m = head.match(/^\[([A-Z]{2}-\d{3})\]\s+(.+)$/);
    if (!m) { errors.push(`${f}: bad heading "${head}"`); continue; }
    const [, id, title] = m;
    if (ids.has(id)) errors.push(`${f}: duplicate id ${id}`);
    ids.add(id);
    const meta = {}; const body = [];
    for (const line of rest) {
      const kv = line.match(/^(tags|levels|level):\s*(.*)$/);
      if (kv && !body.length) meta[kv[1]] = kv[2].trim(); else body.push(line);
    }
    const text2 = body.join('\n').trim();
    if (!meta.tags) errors.push(`${id}: missing tags`);
    if (!['beginner', 'intermediate', 'advanced'].includes(meta.level)) errors.push(`${id}: bad level`);
    if (text2.split(/\s+/).length > 250) errors.push(`${id}: over 250 words`);
    chunks.push({
      id, title, file: f,
      tags: (meta.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
      levels: (meta.levels || '').split(',').map((s) => s.trim()).filter(Boolean),
      level: meta.level, text: text2,
    });
  }
}
if (errors.length) { console.error('build-knowledge FAILED:\n  ' + errors.join('\n  ')); process.exit(1); }
mkdirSync(new URL('../src/coach/', import.meta.url).pathname, { recursive: true });
writeFileSync(out, JSON.stringify(chunks));
console.log(`build-knowledge OK: ${chunks.length} chunks`);
