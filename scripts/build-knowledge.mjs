// Builds src/coach/kb.generated.json from knowledge/*.md and fails the build on invalid chunks.
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadKnowledge } from './lib/knowledge.mjs';

const root = new URL('../', import.meta.url).pathname;
const { chunks, errors } = loadKnowledge(root + 'knowledge/');
if (errors.length) { console.error('build-knowledge FAILED:\n  ' + errors.join('\n  ')); process.exit(1); }
mkdirSync(root + 'src/coach/', { recursive: true });
writeFileSync(root + 'src/coach/kb.generated.json', JSON.stringify(chunks));
console.log(`build-knowledge OK: ${chunks.length} chunks`);
