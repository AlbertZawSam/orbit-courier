import { describe, it, expect, vi, afterEach } from 'vitest';
import * as T from '../src/audio/tension.js';
import { inScale, midiToHz, hzToMidi } from '../src/audio/dsp.js';
import { createAudioEngine } from '../src/audio/engine.js';
import { createAmbience } from '../src/audio/ambience.js';
import { createMusic } from '../src/audio/music.js';
import { createAudio } from '../src/audio/index.js';
import { installBrowserAudio } from '../src/audio/browser.js';
import { createSettings, DEFAULTS } from '../src/state/settings.js';
import { createStorage } from '../src/state/storage.js';
import { createBus } from '../src/state/events.js';
import { sfx } from '../src/audio/sfx.js';
import { MockAudioContext } from './helpers/mockAudio.js';

const CALM = { surfaceDist: Infinity, speed: 0, fuelFraction: 1, tank: 1 };
const TENSE = { surfaceDist: 0, speed: 9, fuelFraction: 0, tank: 1 };
const ready = (o = {}) => { const ctx = new MockAudioContext(); const engine = createAudioEngine({ createContext: () => ctx, ...o }); engine.unlock(); return { ctx, engine }; };
/** Run the music for `seconds` of simulated time; returns the arpeggio oscillators it started. */
function simulate(music, ctx, input, seconds, dt = 0.05) {
  const before = ctx.all('osc').length;
  for (let t = 0; t < seconds; t += dt) { ctx.advance(dt); music.update(dt, input); }
  return ctx.all('osc').slice(before);
}

describe('tension is monotonic', () => {
  it('rises as the probe gets closer to a body', () => {
    let prev = -1;
    for (const d of [Infinity, 20, 8, 6, 4, 2, 1, 0]) { const t = T.tension({ surfaceDist: d, speed: 3, fuelFraction: 1, tank: 1 }); expect(t).toBeGreaterThanOrEqual(prev); prev = t; }
  });
  it('rises with speed', () => {
    let prev = -1;
    for (const v of [0, 1, 3, 5, 9, 20]) { const t = T.tension({ surfaceDist: 4, speed: v, fuelFraction: 1, tank: 1 }); expect(t).toBeGreaterThanOrEqual(prev); prev = t; }
  });
  it('rises as the fuel runs down', () => {
    let prev = -1;
    for (const f of [1, 0.6, 0.4, 0.3, 0.2, 0.1, 0]) { const t = T.tension({ surfaceDist: 4, speed: 3, fuelFraction: f, tank: 1 }); expect(t).toBeGreaterThanOrEqual(prev); prev = t; }
  });
  it('is strictly higher for a clearly worse situation on each axis', () => {
    const base = { surfaceDist: 6, speed: 3, fuelFraction: 0.6, tank: 1 };
    expect(T.tension({ ...base, surfaceDist: 2 })).toBeGreaterThan(T.tension(base));
    expect(T.tension({ ...base, speed: 7 })).toBeGreaterThan(T.tension(base));
    expect(T.tension({ ...base, fuelFraction: 0.1 })).toBeGreaterThan(T.tension(base));
  });
  it('stays within 0..1, is calm when nothing is happening, and peaks when everything is', () => {
    expect(T.tension(CALM)).toBe(0);
    expect(T.tension(TENSE)).toBe(1);
    expect(T.tension()).toBe(0);
    for (const d of [-5, 0, 3, 100]) for (const v of [-2, 0, 50]) for (const f of [-1, 0, 2]) { const t = T.tension({ surfaceDist: d, speed: v, fuelFraction: f, tank: 1 }); expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1); }
  });
  it('ignores fuel on a level with no fuel, and the weights add up to 1', () => {
    expect(T.fuelTerm(0, 0)).toBe(0);
    expect(T.tension({ surfaceDist: Infinity, speed: 0, fuelFraction: 0, tank: 0 })).toBe(0);
    expect(Object.values(T.TENSION_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});

describe('smoothing', () => {
  it('approaches the target without overshooting, independent of frame rate', () => {
    let a = 0, prev = 0;
    for (let i = 0; i < 600; i++) { a = T.smoothTension(a, 1, 1 / 60); expect(a).toBeLessThanOrEqual(1); expect(a).toBeGreaterThanOrEqual(prev); prev = a; }
    expect(a).toBeGreaterThan(0.99);
    let x = 0, y = 0;
    for (let i = 0; i < 30; i++) x = T.smoothTension(x, 1, 1 / 30);
    for (let i = 0; i < 120; i++) y = T.smoothTension(y, 1, 1 / 120);
    expect(x).toBeCloseTo(y, 9);
    expect(T.smoothTension(0.5, 0.5, 1)).toBe(0.5);
  });
});

describe('arpeggio', () => {
  it('plays faster as tension rises, within fixed bounds', () => {
    let prev = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) { const i = T.arpInterval(t); expect(i).toBeLessThan(prev); prev = i; }
    expect(T.arpInterval(0)).toBeCloseTo(T.ARP_SLOW, 12);
    expect(T.arpInterval(1)).toBeCloseTo(T.ARP_FAST, 12);
    expect(T.arpInterval(-3)).toBe(T.arpInterval(0));
    expect(T.arpInterval(9)).toBe(T.arpInterval(1));
  });
  it('only ever plays notes of the pentatonic scale of the tier key', () => {
    for (const root of Object.values(T.TIER_KEYS)) for (const t of [0, 0.3, 0.7, 1]) for (let s = 0; s < 40; s++) {
      const f = T.arpFreq(root, s, t);
      expect(inScale(f, root), `root ${root} step ${s} tension ${t}`).toBe(true);
      expect(hzToMidi(f)).toBeGreaterThanOrEqual(root + 12 - 1e-6);
    }
  });
  it('rises and falls (ping-pong), repeats, and widens its range with tension', () => {
    const walk = (len) => Array.from({ length: 2 * (len - 1) + 1 }, (_, k) => T.pingPong(k, len));
    expect(walk(5)).toEqual([0, 1, 2, 3, 4, 3, 2, 1, 0]);
    expect(T.pingPong(100, 5)).toBe(T.pingPong(100 % 8, 5));
    expect(T.pingPong(3, 1)).toBe(0);
    const high = (t) => Math.max(...Array.from({ length: 40 }, (_, s) => T.arpMidi(45, s, t)));
    expect(high(1)).toBeGreaterThan(high(0));
    expect(T.arpRange(0)).toBe(5); expect(T.arpRange(1)).toBe(10);
  });
  it('the pad chord is root, fifth and octave', () => {
    const [r, f, o] = T.padFreqs(45).map(hzToMidi);
    expect([r, f - r, o - r].map(Math.round)).toEqual([45, 7, 12]);
  });
});

describe('tier keys', () => {
  it('gives each tier its own sensible key and a default for unknown tiers', () => {
    const tiers = ['training', 'inner', 'outer', 'deep', 'lab'];
    expect(new Set(tiers.map(T.tierKey)).size).toBe(tiers.length);
    for (const t of tiers) { expect(T.tierKey(t)).toBeGreaterThanOrEqual(36); expect(T.tierKey(t)).toBeLessThanOrEqual(60); }
    expect(T.tierKey('nowhere')).toBe(45);
    expect(T.tierKey('tutorial')).toBe(T.tierKey('training'));
  });
});

describe('music layer', () => {
  it('does nothing before the audio is unlocked, then builds a pad in the tier key', () => {
    const ctx = new MockAudioContext(), engine = createAudioEngine({ createContext: () => ctx });
    const music = createMusic(engine);
    expect(() => { music.setTier('inner'); music.update(0.016, CALM); }).not.toThrow();
    expect(music.pad).toBeNull();
    engine.unlock(); music.update(0.016, CALM);
    expect(music.pad.oscs).toHaveLength(3);
    expect(hzToMidi(music.pad.oscs[0].frequency.value)).toBeCloseTo(T.tierKey('inner'), 6);
    expect(music.pad.g.gain.calls.some((c) => c[0] === 'target' && c[1] > 0)).toBe(true); // fades in
  });
  it('crossfades to a new key over about 1.5 s and retires the old chord', () => {
    const { ctx, engine } = ready(); const music = createMusic(engine);
    music.setTier('training'); const old = music.pad;
    ctx.advance(1);
    music.setTier('deep');
    expect(music.pad).not.toBe(old);
    const fadeOut = old.g.gain.calls.at(-1);
    expect(fadeOut[0]).toBe('target'); expect(fadeOut[1]).toBe(0); expect(fadeOut[3]).toBeCloseTo(0.5, 9); // 3 time constants = 1.5 s
    for (const o of old.oscs) expect(o.stopped).toBeCloseTo(ctx.currentTime + 2, 9);
    expect(hzToMidi(music.pad.oscs[0].frequency.value)).toBeCloseTo(T.tierKey('deep'), 6);
  });
  it('does not rebuild the pad when the key is unchanged', () => {
    const { ctx, engine } = ready(); const music = createMusic(engine);
    music.setTier('training'); const n = ctx.all('osc').length;
    music.setTier('tutorial'); music.update(0.016, CALM);
    expect(ctx.all('osc').length - n).toBeLessThanOrEqual(1); // at most the first arp note
  });
  it('plays far more arpeggio notes when tense than when calm, always in the key', () => {
    const run = (input) => { const { ctx, engine } = ready(); const m = createMusic(engine); m.setTier('inner'); return simulate(m, ctx, input, 30); };
    const calm = run(CALM), tense = run(TENSE);
    expect(tense.length).toBeGreaterThan(calm.length * 3);
    expect(calm.length).toBeGreaterThan(5);
    for (const o of [...calm, ...tense].filter((n) => n.type === 'sine')) expect(inScale(o.frequency.calls[0][1], T.tierKey('inner'))).toBe(true);
  });
  it('tension builds gradually rather than jumping', () => {
    const { ctx, engine } = ready(); const m = createMusic(engine); m.setTier('training');
    ctx.advance(0.05); m.update(0.05, TENSE);
    expect(m.tension).toBeGreaterThan(0); expect(m.tension).toBeLessThan(0.1);
    simulate(m, ctx, TENSE, 10);
    expect(m.tension).toBeGreaterThan(0.99);
    simulate(m, ctx, CALM, 10);
    expect(m.tension).toBeLessThan(0.01);
  });
  it('can be capped low (for Flight School) and can switch the arpeggio off for "reduce sound"', () => {
    const { ctx, engine } = ready(); const m = createMusic(engine); m.setTier('training'); m.setCap(0.2);
    simulate(m, ctx, TENSE, 20);
    expect(m.tension).toBeLessThanOrEqual(0.2 + 1e-9);
    const quiet = ready(); const q = createMusic(quiet.engine); q.setTier('training'); q.setArpeggio(false);
    const notes = simulate(q, quiet.ctx, TENSE, 20);
    expect(notes).toHaveLength(0);
    expect(q.pad.oscs).toHaveLength(3); // the pad keeps playing
  });
  it('pitches down in slow motion', () => {
    const { ctx, engine } = ready(); const m = createMusic(engine); m.setTier('training');
    m.setSlow(true); ctx.advance(0.1); m.update(0.1, CALM);
    expect(m.pad.oscs[0].detune.calls.at(-1)[1]).toBeLessThan(-250);
    m.setSlow(false); ctx.advance(0.1); m.update(0.1, CALM);
    expect(m.pad.oscs[0].detune.calls.at(-1)[1]).toBeGreaterThan(-20);
  });
  it('together with the ambience and heavy sfx spam it never exceeds the 24-voice budget', () => {
    const { ctx, engine } = ready(); const m = createMusic(engine), amb = createAmbience(engine);
    m.setTier('training'); m.setTier('deep');
    amb.update({ playing: true, frame: null, fuelFraction: 1, tank: 1, progress: 0, target: null });
    for (let i = 0; i < 400; i++) { sfx.crash(engine); sfx.stars(engine, 3); ctx.advance(0.02); m.update(0.02, TENSE); }
    expect(ctx.activeSources().length).toBeLessThanOrEqual(24);
  });
});

describe('engine: bus levels and suspend', () => {
  it('remembers bus gains set before the context exists', () => {
    const ctx = new MockAudioContext(), engine = createAudioEngine({ createContext: () => ctx });
    engine.setBusGain('music', 0); engine.setBusGain('hum', 0.4);
    engine.unlock();
    expect(engine.buses.music.gain.value).toBe(0);
    expect(engine.buses.hum.gain.value).toBe(0.4);
    expect(engine.buses.sfx.gain.value).toBe(1);
    engine.setBusGain('music', 9); expect(engine.buses.music.gain.value).toBe(1);
  });
  it('suspends a running context and resumes it, and is safe before the context exists', () => {
    const none = createAudioEngine({ createContext: () => new MockAudioContext() });
    expect(() => { none.suspend(); none.resume(); }).not.toThrow();
    const { ctx, engine } = ready();
    engine.suspend(); expect(ctx.state).toBe('suspended');
    engine.suspend(); expect(ctx.suspended).toBe(1);
    engine.resume(); expect(ctx.state).toBe('running');
  });
});

describe('applySettings', () => {
  const rig = () => { const ctx = new MockAudioContext(), bus = createBus(); const audio = createAudio({ bus, createContext: () => ctx }); return { ctx, bus, audio }; };
  it('maps each switch to its bus and to master volume and mute', () => {
    const { audio } = rig(); audio.unlock();
    audio.applySettings({ ...DEFAULTS, volume: 0.5, sfxOn: false, humOn: false, musicOn: false });
    const b = audio.engine.buses;
    expect([b.sfx.gain.value, b.thrust.gain.value, b.hum.gain.value, b.music.gain.value]).toEqual([0, 0, 0, 0]);
    expect(b.ui.gain.value).toBe(1);
    audio.applySettings({ ...DEFAULTS, volume: 0.5 });
    expect([b.sfx.gain.value, b.hum.gain.value, b.music.gain.value]).toEqual([1, 1, 1]);
    audio.applySettings({ ...DEFAULTS, soundOn: false });
    expect(audio.engine.muted).toBe(true);
  });
  it('"reduce sound" turns off the hum, the ping and the arpeggio but keeps the pad and sound effects', () => {
    const { ctx, audio } = rig(); audio.unlock();
    audio.applySettings({ ...DEFAULTS, reduceSound: true });
    expect(audio.engine.buses.hum.gain.value).toBe(0);
    expect(audio.engine.buses.sfx.gain.value).toBe(1);
    audio.music.setTier('training');
    const frame = { hum: [], doppler: null, target: { r: 3 } };
    const st = { playing: true, frame, fuelFraction: 1, tank: 1, progress: 0, target: null, dt: 0.05, musicInput: TENSE };
    const before = ctx.all('osc').length;
    for (let i = 0; i < 200; i++) { ctx.advance(0.05); audio.update(st); }
    const created = ctx.all('osc').slice(before);
    expect(created.filter((o) => o.type === 'sine' && o.frequency.calls[0]?.[1] > 400)).toHaveLength(0); // no pings or arps
    audio.applySettings({ ...DEFAULTS });
    const before2 = ctx.all('osc').length;
    for (let i = 0; i < 200; i++) { ctx.advance(0.05); audio.update(st); }
    expect(ctx.all('osc').length - before2).toBeGreaterThan(10);
  });
});

describe('settings', () => {
  it('has audio defaults and persists changes', () => {
    expect(DEFAULTS).toMatchObject({ soundOn: true, volume: 0.8, sfxOn: true, musicOn: true, humOn: true, pingOn: true, reduceSound: false });
    const storage = createStorage(''); const a = createSettings(storage);
    a.set('volume', 0.3); a.set('reduceSound', true);
    const b = createSettings(storage);
    expect(b.get('volume')).toBe(0.3); expect(b.get('reduceSound')).toBe(true); expect(b.get('musicOn')).toBe(true);
  });
});

describe('browser hooks', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  function stage() {
    const win = { handlers: {}, addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }, removeEventListener(t, f) { this.handlers[t] = (this.handlers[t] ?? []).filter((x) => x !== f); } };
    const doc = { hidden: false, handlers: {}, addEventListener(t, f) { (this.handlers[t] ??= []).push(f); } };
    vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
    const ctx = new MockAudioContext(), mainBus = createBus(), fx = createBus();
    const audio = createAudio({ bus: fx, createContext: () => ctx });
    const settings = createSettings(createStorage(''));
    installBrowserAudio({ audio, settings, mainBus });
    return { win, doc, ctx, mainBus, audio, settings };
  }
  it('unlocks on the first gesture only, then stops listening', async () => {
    const { win, audio } = stage();
    expect(audio.engine.ready).toBe(false);
    win.handlers.pointerdown[0]();
    await audio.engine.resumed; await Promise.resolve();
    expect(audio.engine.ready).toBe(true);
    expect(win.handlers.pointerdown).toHaveLength(0);
    expect(win.handlers.keydown).toHaveLength(0);
  });
  it('keeps listening when the first gesture does not start the audio (a modifier key), until it is running', async () => {
    const win = { handlers: {}, addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }, removeEventListener(t, f) { this.handlers[t] = (this.handlers[t] ?? []).filter((x) => x !== f); } };
    vi.stubGlobal('window', win); vi.stubGlobal('document', { hidden: false, addEventListener() {} });
    class Stubborn extends MockAudioContext { constructor() { super(); this.allow = false; } resume() { this.resumed++; if (this.allow) this.state = 'running'; return Promise.resolve(); } }
    const ctx = new Stubborn(), audio = createAudio({ bus: createBus(), createContext: () => ctx });
    installBrowserAudio({ audio, settings: createSettings(createStorage('')), mainBus: createBus() });
    win.handlers.keydown[0]();                      // Shift: the browser refuses to start the context
    await audio.engine.resumed;
    expect(audio.engine.ready).toBe(true);
    expect(audio.engine.running).toBe(false);
    expect(win.handlers.keydown).toHaveLength(1);   // still listening
    ctx.allow = true;
    win.handlers.pointerdown[0]();                  // a real click
    await audio.engine.resumed;
    expect(audio.engine.running).toBe(true);
    await Promise.resolve();
    expect(win.handlers.keydown).toHaveLength(0);
    expect(win.handlers.pointerdown).toHaveLength(0);
  });
  it('emits a click sound for buttons only', () => {
    const { doc, mainBus } = stage(); const seen = [];
    mainBus.on('ui_click', () => seen.push(1));
    doc.handlers.click[0]({ target: { closest: (s) => (s === 'button' ? {} : null) } });
    doc.handlers.click[0]({ target: { closest: () => null } });
    expect(seen).toHaveLength(1);
  });
  it('pauses audio while the tab is hidden and resumes when it returns', () => {
    const { win, doc, ctx } = stage();
    win.handlers.keydown[0]();
    doc.hidden = true; doc.handlers.visibilitychange[0]();
    expect(ctx.state).toBe('suspended');
    doc.hidden = false; doc.handlers.visibilitychange[0]();
    expect(ctx.state).toBe('running');
  });
  it('applies saved settings at start and whenever they change', () => {
    const { win, audio, settings } = stage();
    win.handlers.keydown[0]();
    settings.set('musicOn', false);
    expect(audio.engine.buses.music.gain.value).toBe(0);
    settings.set('soundOn', false);
    expect(audio.engine.muted).toBe(true);
    settings.set('soundOn', true);
    expect(audio.engine.muted).toBe(false);
  });
});
