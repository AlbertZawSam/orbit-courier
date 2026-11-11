// Dev-only: screenshots of the built game (dist/index.html over file://) into /shots, plus a runtime smoke test.
// Needs the optional `playwright` dev dependency and `npx playwright install chromium`. Never bundled.
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!existsSync(root + 'dist/index.html')) { console.error('shot: run `npm run build` first'); process.exit(1); }
mkdirSync(root + 'shots', { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problems.push(`[network] ${r.url()}`); });

const shot = async (name) => { await page.screenshot({ path: `${root}shots/${name}.png` }); console.log('shot', name); };
const url = (hash) => `file://${root}dist/index.html#${hash}`;

await page.goto(url('L1')); await page.waitForTimeout(1500);
await shot('l1-planning');
await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
await shot('l1-flying');
await page.waitForTimeout(4000);
await shot('l1-result');
await page.goto(url('L3')); await page.reload(); await page.waitForTimeout(1200);
await page.keyboard.press('n'); await page.waitForTimeout(300);
await shot('l3-node');
await page.keyboard.press('h'); await page.waitForTimeout(300);
await page.keyboard.type('how do I add a burn node'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
await shot('l3-coach');

await page.goto(url('gallery')); await page.reload(); await page.waitForTimeout(1500);
await shot('gallery');

await browser.close();
if (problems.length) { console.log('\nBrowser messages:\n  ' + [...new Set(problems)].join('\n  ')); }
else console.log('\nNo console errors, warnings, or network requests.');
