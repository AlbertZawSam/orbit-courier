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
await page.addInitScript(() => { try { localStorage.setItem('orbit.settings.v1', JSON.stringify({ quality: 'high' })); } catch { /* ignore */ } }); // slow software rendering would otherwise trigger auto-downgrade
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problems.push(`[network] ${r.url()}`); });

const shot = async (name) => { await page.screenshot({ path: `${root}shots/${name}.png` }); console.log('shot', name); };
const url = (hash) => `file://${root}dist/index.html?debug#${hash}`;
const open = async (hash) => { await page.goto(url(hash)); await page.reload(); await page.waitForTimeout(1200); };
const waitSim = async (seconds) => page.waitForFunction((s) => window.__orbit.state().t >= s || window.__orbit.state().phase === 'ended', seconds, { timeout: 60000 });

// 1. the default aim (a crash): dashed danger path after the marker
await open('L1'); await shot('l1-planning-crash');
// 2. the stored solution: ribbon, ticks, closest-approach pin, target band
await page.evaluate(() => window.__orbit.applySolution()); await page.waitForTimeout(500); await shot('l1-solution-planning');
await page.evaluate(() => window.__orbit.launch());
await waitSim(2.2); await page.waitForTimeout(200); await shot('l1-flying');
await page.waitForFunction(() => window.__orbit.state().phase === 'ended', null, { timeout: 60000 }); await page.waitForTimeout(500); await shot('l1-delivered');
// 3. L3: node with handles, then the burn plume
await open('L3'); await page.evaluate(() => window.__orbit.applySolution()); await page.waitForTimeout(500); await shot('l3-node');
await page.evaluate(() => window.__orbit.launch());
await waitSim(5.55); await page.waitForTimeout(250); await shot('l3-burn');
// 4. a crash burst
await open('L1'); await page.evaluate(() => window.__orbit.launch());
await page.waitForFunction(() => window.__orbit.state().phase === 'ended', null, { timeout: 60000 }); await page.waitForTimeout(350); await shot('l1-crash');
// 5. camera modes: cinematic launch, focus, and the replay camera
await open('L1'); await page.evaluate(() => window.__orbit.applySolution()); await page.waitForTimeout(400);
await page.evaluate(() => window.__orbit.launch()); await page.waitForTimeout(150);
console.log('camera right after launch:', await page.evaluate(() => window.__orbit.cameraMode()));
await waitSim(0.7); await page.waitForTimeout(100); await shot('l1-cinematic');
await page.waitForFunction(() => window.__orbit.state().phase === 'ended', null, { timeout: 90000 }); await page.waitForTimeout(1500);
await page.evaluate(() => window.__orbit.replay()); await page.waitForTimeout(150);
console.log('camera during replay:', await page.evaluate(() => window.__orbit.cameraMode()), '| phase:', await page.evaluate(() => window.__orbit.state().phase));
await waitSim(1.6); await page.waitForTimeout(100); await shot('l1-replay');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('after Escape:', await page.evaluate(() => window.__orbit.state().phase), '| camera:', await page.evaluate(() => window.__orbit.cameraMode()));
await open('L1'); await page.keyboard.press('f'); await page.waitForTimeout(1800); await shot('l1-focus');
console.log('camera after F:', await page.evaluate(() => window.__orbit.cameraMode()));
// 5. the Navigator panel and the renderer test bench
await open('L3'); await page.keyboard.press('h'); await page.waitForTimeout(200);
await page.keyboard.type('how do I add a burn node'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); await shot('l3-coach');
await page.goto(`file://${root}dist/index.html#gallery`); await page.reload(); await page.waitForTimeout(1500); await shot('gallery');

await browser.close();
if (problems.length) { console.log('\nBrowser messages:\n  ' + [...new Set(problems)].join('\n  ')); }
else console.log('\nNo console errors, warnings, or network requests.');
