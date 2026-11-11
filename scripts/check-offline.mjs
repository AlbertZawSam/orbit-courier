// Fails the build if dist/index.html could make a network request at runtime.
import { readFileSync, existsSync } from 'node:fs';

const file = new URL('../dist/index.html', import.meta.url);
if (!existsSync(file)) { console.error('check-offline: dist/index.html not found'); process.exit(1); }
const html = readFileSync(file, 'utf8');

const banned = [
  /<script[^>]+src=["']?https?:/i,
  /<link[^>]+href=["']?https?:/i,
  /<img[^>]+src=["']?https?:/i,
  /@import\s+url\(\s*["']?https?:/i,
  /googleapis/i,
  /\bcdn\./i,
  /unpkg/i,
  /jsdelivr/i,
  /new Worker\(\s*["'`]https?:/i,
  /importScripts\(\s*["'`]https?:/i,
];
const ALLOWED_LITERAL = 'http://localhost:11434';
const problems = [];
for (const re of banned) if (re.test(html)) problems.push(`matches ${re}`);

// fetch()/XMLHttpRequest with a literal http(s) URL, other than the one allowed literal.
for (const m of html.matchAll(/(?:fetch\(|\.open\(\s*["'][A-Z]+["']\s*,)\s*["'`](https?:\/\/[^"'`]+)/g)) {
  if (!m[1].startsWith(ALLOWED_LITERAL)) problems.push(`network call to ${m[1]}`);
}

if (problems.length) {
  console.error('check-offline FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`check-offline OK (${(html.length / 1024).toFixed(0)} KB, single file)`);
