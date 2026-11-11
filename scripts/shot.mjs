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
// 5. audio smoke test: nothing before a gesture, then a real AudioContext with non-silent output during a launch
await open('L1');
console.log('audio before any gesture:', JSON.stringify(await page.evaluate(() => window.__orbit.audio())));
await page.keyboard.press('Shift'); await page.waitForTimeout(300);
console.log('audio after Shift only (a modifier key is not a user activation):', JSON.stringify(await page.evaluate(() => window.__orbit.audio())));
await page.keyboard.press('x'); await page.waitForTimeout(400);
console.log('audio after a key press :', JSON.stringify(await page.evaluate(() => window.__orbit.audio())));
await page.evaluate(() => window.__orbit.applySolution()); await page.waitForTimeout(300);
await page.evaluate(() => window.__orbit.launch());
const levels = [];
for (let k = 0; k < 24; k++) { await page.waitForTimeout(150); levels.push(await page.evaluate(() => window.__orbit.audio())); }
const rms = levels.map((l) => l.level);
console.log(`audio level during launch: max ${Math.max(...rms).toFixed(4)}, mean ${(rms.reduce((a, b) => a + b, 0) / rms.length).toFixed(4)}, max voices ${Math.max(...levels.map((l) => l.voices))}`);
await page.keyboard.press('m'); await page.waitForTimeout(400);
console.log('after M (muted):', JSON.stringify(await page.evaluate(() => window.__orbit.audio())));
await page.keyboard.press('m'); await page.waitForTimeout(400);
// music at idle, the Sound popover, and switching the music off from it
await open('L1'); await page.keyboard.press('x'); await page.waitForTimeout(2500);
const idle = []; for (let k = 0; k < 8; k++) { await page.waitForTimeout(120); idle.push((await page.evaluate(() => window.__orbit.audio())).level); }
console.log(`music at idle: max ${Math.max(...idle).toFixed(4)}, voices ${(await page.evaluate(() => window.__orbit.audio())).voices}`);
await page.click('[data-k="soundbtn"]'); await page.waitForTimeout(250); await shot('sound-settings');
await page.click('#settings [data-s="musicOn"]'); await page.waitForTimeout(900);
const off = []; for (let k = 0; k < 6; k++) { await page.waitForTimeout(120); off.push((await page.evaluate(() => window.__orbit.audio())).level); }
console.log(`music switched off in the popover: max ${Math.max(...off).toFixed(4)}`);
await page.click('#settings [data-k="close"]');

// 5a. Low quality must still look good; reduced motion must drop the cinematic camera
await open('L1'); await page.keyboard.press('q'); await page.keyboard.press('q'); await page.waitForTimeout(800);
console.log('quality after Q Q:', await page.evaluate(() => document.querySelector('[data-k="quality"]').textContent));
await page.evaluate(() => window.__orbit.applySolution()); await page.waitForTimeout(500); await shot('l1-low');
await page.emulateMedia({ reducedMotion: 'reduce' });
await open('L1'); await page.evaluate(() => window.__orbit.applySolution()); await page.waitForTimeout(300);
await page.evaluate(() => window.__orbit.launch()); await page.waitForTimeout(200);
console.log('reduced motion: camera right after launch =', await page.evaluate(() => window.__orbit.cameraMode()), '(expected follow, not cinematic)');
await waitSim(1.0); await shot('l1-reduced');
await page.emulateMedia({ reducedMotion: 'no-preference' });

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
