import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dsp from '../src/audio/dsp.js';
import { createAudioEngine, VoicePool } from '../src/audio/engine.js';
import { createAmbience } from '../src/audio/ambience.js';
import { sfx } from '../src/audio/sfx.js';
import { EVENT_SOUNDS, ALL_EVENTS, wireAudio } from '../src/audio/events.js';
import { createAudio } from '../src/audio/index.js';
import { audioFrame } from '../src/audio/state.js';
import { createBus } from '../src/state/events.js';
import { buildSystem } from '../src/sim/rails.js';
import { MockAudioContext } from './helpers/mockAudio.js';
import { sandbox } from './fixtures/sandbox.js';

const KINDS = Object.keys(dsp.HUM_BASE);
const ACCELS = [0.001, 0.01, 0.05, 0.1, 0.3, 1, 2.5, 8, 30, 200];
const ready = (opts = {}) => { const ctx = new MockAudioContext(); const engine = createAudioEngine({ createContext: () => ctx, ...opts }); engine.unlock(); return { ctx, engine }; };

describe('pitch mapping stays in scale', () => {
  it('every hum pitch is a pentatonic note, for every body kind and pull', () => {
    for (const k of KINDS) for (const a of ACCELS) expect(dsp.inScale(dsp.humFreq(a, k)), `${k} ${a}`).toBe(true);
    expect(dsp.inScale(dsp.humFreq(1, 'unknown-kind'))).toBe(true);
  });
  it('ping, node tick, shimmer and delivery notes are all in scale', () => {
    for (const d of [0, 0.5, 2, 5, 12, 40]) expect(dsp.inScale(dsp.pingFreq(d))).toBe(true);
    for (const v of [0, 0.1, 0.5, 1, 1.5, 9]) expect(dsp.inScale(dsp.nodeTickFreq(v))).toBe(true);
    for (let p = 0; p <= 1; p += 0.05) expect(dsp.inScale(dsp.shimmerFreq(p))).toBe(true);
    const { arp, bells } = dsp.deliveryNotes(3);
    for (const f of [...arp, ...bells]) expect(dsp.inScale(f)).toBe(true);
    expect(dsp.inScale(440 * 1.01)).toBe(false);
  });
  it('quantizing snaps to the nearest scale note and is idempotent', () => {
    for (let f = 60; f < 4000; f *= 1.07) { const q = dsp.quantizeHz(f); expect(dsp.inScale(q)).toBe(true); expect(dsp.quantizeHz(q)).toBeCloseTo(q, 6); }
  });
});

describe('gravity hum mapping', () => {
  it('pitch never falls as the pull grows, and heavy bodies sit below light ones', () => {
    for (const k of KINDS) { let prev = 0; for (const a of ACCELS) { const f = dsp.humFreq(a, k); expect(f).toBeGreaterThanOrEqual(prev - 1e-9); prev = f; } }
    expect(dsp.humFreq(1, 'gas')).toBeLessThan(dsp.humFreq(1, 'moon'));
    expect(dsp.humFreq(1, 'star')).toBeLessThan(dsp.humFreq(1, 'rocky'));
  });
  it('loudness is zero without a pull, bounded, and rises with proximity', () => {
    expect(dsp.humGain(0)).toBe(0);
    let prev = -1;
    for (const a of ACCELS) { const g = dsp.humGain(a); expect(g).toBeGreaterThanOrEqual(prev); expect(g).toBeLessThanOrEqual(1); prev = g; }
  });
});

describe('Doppler, ping and envelopes', () => {
  it('Doppler is above 1 closing, below 1 receding, 1 at rest, monotonic, and finite at the limit', () => {
    expect(dsp.dopplerFactor(5)).toBeGreaterThan(1);
    expect(dsp.dopplerFactor(-5)).toBeLessThan(1);
    expect(dsp.dopplerFactor(0)).toBe(1);
    let prev = 0; for (let v = -20; v <= 20; v += 1) { const f = dsp.dopplerFactor(v); expect(f).toBeGreaterThanOrEqual(prev); expect(Number.isFinite(f)).toBe(true); prev = f; }
    expect(Number.isFinite(dsp.dopplerFactor(1e9))).toBe(true);
  });
  it('the swoosh needs both speed and a close pass', () => {
    expect(dsp.dopplerGain(0, 0)).toBe(0);
    expect(dsp.dopplerGain(8, 20)).toBe(0);
    expect(dsp.dopplerGain(8, 0)).toBe(1);
    expect(dsp.dopplerGain(3, 3)).toBeGreaterThan(0);
  });
  it('pings come faster and higher as the probe gets closer', () => {
    let prevI = 0, prevF = Infinity;
    for (const d of [0, 1, 3, 8, 20]) { expect(dsp.pingInterval(d)).toBeGreaterThanOrEqual(prevI); expect(dsp.pingFreq(d)).toBeLessThanOrEqual(prevF); prevI = dsp.pingInterval(d); prevF = dsp.pingFreq(d); }
    expect(dsp.pingInterval(0)).toBeGreaterThanOrEqual(0.22);
    expect(dsp.pingInterval(1e6)).toBeLessThanOrEqual(2.2);
  });
  it('the thruster envelope attacks, sustains, releases, and stays within 0..1', () => {
    expect(dsp.thrustEnvelope(-1, 1)).toBe(0);
    expect(dsp.thrustEnvelope(0.025, 1)).toBeCloseTo(0.5, 9);
    expect(dsp.thrustEnvelope(0.5, 1)).toBe(1);
    expect(dsp.thrustEnvelope(1.1, 1)).toBeCloseTo(0.5, 9);
    expect(dsp.thrustEnvelope(5, 1)).toBe(0);
    for (let t = -0.5; t < 3; t += 0.01) { const e = dsp.thrustEnvelope(t, 1); expect(e).toBeGreaterThanOrEqual(0); expect(e).toBeLessThanOrEqual(1); }
    expect(dsp.thrustCutoff(1)).toBeGreaterThan(dsp.thrustCutoff(0));
  });
  it('shimmer climbs with progress, delivery gives an ascending arpeggio and one bell per star', () => {
    let prev = 0; for (let p = 0; p <= 1; p += 0.05) { const f = dsp.shimmerFreq(p); expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
    const { arp } = dsp.deliveryNotes(0);
    expect(arp).toHaveLength(5);
    expect([...arp].sort((a, b) => a - b)).toEqual(arp);
    for (const n of [0, 1, 2, 3]) expect(dsp.deliveryNotes(n).bells).toHaveLength(n);
    expect(dsp.deliveryNotes(9).bells).toHaveLength(3);
  });
  it('low fuel triggers under 20% of a real tank only; slow motion closes the filter', () => {
    expect(dsp.lowFuel(0.19, 2)).toBe(true);
    expect(dsp.lowFuel(0.2, 2)).toBe(false);
    expect(dsp.lowFuel(0, 0)).toBe(false);
    expect(dsp.dilationCutoff(true)).toBeLessThan(dsp.dilationCutoff(false));
  });
});

describe('throttle', () => {
  it('allows one call per interval per key, independently', () => {
    let now = 1000; const th = dsp.createThrottle(300, () => now);
    expect(th('a')).toBe(true); expect(th('a')).toBe(false);
    expect(th('b')).toBe(true);
    now += 299; expect(th('a')).toBe(false);
    now += 2; expect(th('a')).toBe(true);
  });
});

describe('engine', () => {
  it('creates no context until unlocked, and every call is a safe no-op before that', () => {
    let made = 0; const engine = createAudioEngine({ createContext: () => { made++; return new MockAudioContext(); } });
    expect(engine.ready).toBe(false);
    expect(engine.voice(1, 1, () => { throw new Error('should not run'); })).toBe(false);
    expect(() => { engine.setMuted(true); engine.setSlow(true); engine.setVolume(0.5); }).not.toThrow();
    expect(engine.level()).toBe(0);
    expect(made).toBe(0);
    expect(engine.unlock()).toBe(true);
    expect(engine.unlock()).toBe(true);
    expect(made).toBe(1);
  });
  it('resumes a suspended context on unlock, and survives missing Web Audio', () => {
    const { ctx } = ready();
    expect(ctx.state).toBe('running');
    const none = createAudioEngine({ createContext: () => { throw new Error('no Web Audio'); } });
    expect(none.unlock()).toBe(false);
    expect(none.ready).toBe(false);
    expect(none.voice(1, 1, () => [])).toBe(false);
  });
  it('wires every bus through master and the time-dilation lowpass to the output', () => {
    const { ctx, engine } = ready();
    const lowpass = ctx.all('filter').find((f) => f.type === 'lowpass' && f.frequency.value === 18000);
    expect(lowpass).toBeTruthy();
    expect(lowpass.outs).toContain(ctx.destination);
    for (const name of ['sfx', 'thrust', 'hum', 'ui']) { expect(ctx.reaches(engine.buses[name], lowpass), name).toBe(true); expect(ctx.reaches(engine.buses[name], ctx.destination)).toBe(true); }
  });
  it('mute silences the master and unmute restores it', () => {
    const { ctx, engine } = ready();
    const master = ctx.all('gain').find((g) => g.outs.includes(ctx.all('filter')[0]));
    engine.setMuted(true);
    expect(master.gain.value).toBe(0);
    expect(engine.muted).toBe(true);
    engine.setMuted(false);
    expect(master.gain.value).toBeCloseTo(0.8, 9);
    engine.setVolume(0.3);
    expect(master.gain.value).toBeCloseTo(0.3, 9);
    engine.setMuted(true); engine.setVolume(0.9);
    expect(master.gain.value).toBe(0); // volume changes do not unmute
  });
  it('time dilation sweeps the lowpass down in slow motion and back up', () => {
    const { ctx, engine } = ready();
    const lowpass = ctx.all('filter')[0];
    engine.setSlow(true); expect(lowpass.frequency.value).toBe(700); expect(engine.slow).toBe(true);
    engine.setSlow(false); expect(lowpass.frequency.value).toBe(18000);
    expect(lowpass.frequency.calls.some((c) => c[0] === 'target' && c[3] > 0)).toBe(true); // glides, never jumps
  });
});

describe('voice limit', () => {
  it('never starts more than 24 sounds at once, however hard it is spammed', () => {
    const { ctx, engine } = ready();
    for (let i = 0; i < 200; i++) { sfx.click(engine); sfx.crash(engine); sfx.stars(engine, 3); }
    expect(ctx.activeSources().length).toBeLessThanOrEqual(24);
    expect(engine.pool.count).toBeLessThanOrEqual(24);
  });
  it('a higher-priority sound steals a slot from a lower one; an equal or lower one is dropped', () => {
    const { ctx, engine } = ready({ maxVoices: 3 });
    const mk = (p) => engine.voice(5, p, (c, t) => { const o = c.createOscillator(); o.start(t); return [o]; });
    expect([mk(0), mk(0), mk(0)]).toEqual([true, true, true]);
    expect(mk(0)).toBe(false);
    expect(mk(3)).toBe(true);
    expect(ctx.all('osc').filter((o) => o.stopped !== null).length).toBe(1);
    expect(engine.pool.count).toBe(3);
  });
  it('frees slots when voices end', () => {
    const { ctx, engine } = ready({ maxVoices: 2 });
    const mk = () => engine.voice(0.5, 1, (c, t) => { const o = c.createOscillator(); o.start(t); return [o]; });
    mk(); mk();
    expect(mk()).toBe(false);
    ctx.advance(1);
    expect(mk()).toBe(true);
  });
  it('persistent layers count against the budget', () => {
    const { ctx, engine } = ready();
    const amb = createAmbience(engine);
    amb.update({ playing: true, frame: null, fuelFraction: 1, tank: 1, progress: 0, target: null });
    expect(engine.pool.count).toBe(amb.reserved);
    for (let i = 0; i < 100; i++) sfx.crash(engine);
    expect(ctx.activeSources().length).toBeLessThanOrEqual(24);
  });
});

describe('audioFrame', () => {
  const sys = Object.assign(buildSystem(sandbox.bodies.map((b) => ({ ...b }))), { bounds: 120 });
  it('orders bodies by pull and returns the two strongest for the hum', () => {
    const home = sys.byId.home.pos(0);
    const f = audioFrame(sys, { x: home[0] + 2, z: home[1], vx: 0, vz: 0 }, 0, 'kepi');
    expect(f.hum).toHaveLength(2);
    expect(f.hum[0].id).toBe('home');
    expect(f.hum[0].accel).toBeGreaterThanOrEqual(f.hum[1].accel);
    expect(f.hum[0].id).not.toBe(f.hum[1].id);
    expect(f.doppler.id).toBe('home');
    expect(f.target.id).toBe('kepi');
    expect(f.all.length).toBe(3);
  });
  it('reports closing speed with the right sign either side of a flyby', () => {
    const flat = buildSystem([{ id: 'h', kind: 'rocky', mu: 50, radius: 1, name: 'H' }]);
    const before = audioFrame(flat, { x: -10, z: 1, vx: 5, vz: 0 }, 0, 'h').doppler;
    const after = audioFrame(flat, { x: 10, z: 1, vx: 5, vz: 0 }, 0, 'h').doppler;
    expect(before.closing).toBeGreaterThan(0);
    expect(after.closing).toBeLessThan(0);
    expect(dsp.dopplerFactor(before.closing)).toBeGreaterThan(1);
    expect(dsp.dopplerFactor(after.closing)).toBeLessThan(1);
    expect(before.speed).toBeCloseTo(5, 9);
  });
  it('is finite sitting on top of a body', () => {
    const flat = buildSystem([{ id: 'h', kind: 'rocky', mu: 50, radius: 1 }]);
    const f = audioFrame(flat, { x: 0, z: 0, vx: 0, vz: 0 }, 0, 'h');
    expect(Number.isFinite(f.hum[0].accel)).toBe(true);
    expect(Number.isFinite(f.doppler.closing)).toBe(true);
  });
});

describe('ambience layers', () => {
  const frame = (o = {}) => ({ hum: [{ accel: 2, kind: 'rocky' }, { accel: 0.2, kind: 'moon' }], doppler: { closing: 6, speed: 6, r: 2, radius: 1 }, target: { r: 4 }, ...o });
  const state = (o = {}) => ({ playing: true, frame: frame(), fuelFraction: 1, tank: 1, progress: 0, target: null, ...o });

  it('does nothing before unlock, and builds its layers exactly once after', () => {
    const engine = createAudioEngine({ createContext: () => new MockAudioContext() });
    const amb = createAmbience(engine);
    expect(() => amb.update(state())).not.toThrow();
    expect(amb.built).toBe(false);
    engine.unlock();
    amb.update(state()); const n = engine.context.nodes.length;
    amb.update(state());
    expect(amb.built).toBe(true);
    expect(engine.context.nodes.length - n).toBeLessThan(3); // only the odd one-shot (a ping), no rebuilt layers
  });
  it('hums at in-scale pitches, quieter for the weaker pull, and falls silent with no frame', () => {
    const { engine } = ready(); const amb = createAmbience(engine);
    amb.update(state());
    const [h0, h1] = amb.layers.hum;
    expect(dsp.inScale(h0.a.frequency.value)).toBe(true);
    expect(dsp.inScale(h1.a.frequency.value)).toBe(true);
    expect(h0.g.gain.value).toBeGreaterThan(h1.g.gain.value);
    amb.update(state({ frame: null }));
    expect(h0.g.gain.value).toBe(0);
    amb.update(state({ playing: false }));
    expect(h1.g.gain.value).toBe(0);
  });
  it('Doppler pitch is above its centre when closing and below it when receding', () => {
    const { engine } = ready(); const amb = createAmbience(engine);
    amb.update(state());
    const up = amb.layers.doppler.bp.frequency.value;
    amb.update(state({ frame: frame({ doppler: { closing: -6, speed: 6, r: 2, radius: 1 } }) }));
    const down = amb.layers.doppler.bp.frequency.value;
    expect(up).toBeGreaterThan(900); expect(down).toBeLessThan(900); expect(down).toBeLessThan(up);
    amb.update(state({ frame: frame({ doppler: { closing: 6, speed: 0.2, r: 40, radius: 1 } }) }));
    expect(amb.layers.doppler.g.gain.value).toBe(0);
  });
  it('the orbit-lock shimmer appears with progress and rises with it', () => {
    const { engine } = ready(); const amb = createAmbience(engine);
    amb.update(state({ progress: 0 })); expect(amb.layers.shimmer.g.gain.value).toBe(0);
    amb.update(state({ progress: 0.2 })); const g1 = amb.layers.shimmer.g.gain.value, f1 = amb.layers.shimmer.s1.frequency.value;
    amb.update(state({ progress: 0.9 })); expect(amb.layers.shimmer.g.gain.value).toBeGreaterThan(g1); expect(amb.layers.shimmer.s1.frequency.value).toBeGreaterThanOrEqual(f1);
    expect(g1).toBeGreaterThan(0);
  });
  it('the thruster follows a burst and dies away afterwards', () => {
    const { ctx, engine } = ready(); const amb = createAmbience(engine);
    amb.update(state());
    expect(amb.layers.thrust.g.gain.value).toBe(0);
    amb.thrustBurst(0.4); ctx.advance(0.2); amb.update(state());
    const during = amb.layers.thrust.g.gain.value, open = amb.layers.thrust.lp.frequency.value;
    expect(during).toBeGreaterThan(0.1); expect(open).toBeGreaterThan(2000);
    ctx.advance(2); amb.update(state());
    expect(amb.layers.thrust.g.gain.value).toBe(0);
  });
  it('pings the target at a rate set by distance, and pulses gently when fuel is low', () => {
    const { ctx, engine } = ready(); const amb = createAmbience(engine);
    const sources = () => ctx.all('osc').length;
    amb.update(state()); const a = sources();
    amb.update(state()); expect(sources()).toBe(a);                  // same instant: no second ping
    ctx.advance(dsp.pingInterval(4) + 0.01); amb.update(state());
    expect(sources()).toBe(a + 1);
    const before = sources();
    amb.update(state({ fuelFraction: 0.1, tank: 1 }));
    expect(sources()).toBeGreaterThan(before);                       // low-fuel pulse
    const pulses = sources(); amb.update(state({ fuelFraction: 0.1, tank: 1 })); expect(sources()).toBe(pulses);
    ctx.advance(1.7); amb.update(state({ fuelFraction: 0.1, tank: 1 })); expect(sources()).toBeGreaterThan(pulses);
    const quiet = createAmbience(ready().engine); quiet.update(state({ playing: false, fuelFraction: 0.05 }));
    expect(quiet.built).toBe(true);
  });
});

describe('event table', () => {
  it('has a sound or an explicit silent entry (with a reason) for every event, and nothing unknown', () => {
    for (const e of ALL_EVENTS) {
      const entry = EVENT_SOUNDS[e];
      expect(entry, e).toBeTruthy();
      expect(typeof entry.play === 'function' || (typeof entry.silent === 'string' && entry.silent.length > 10), e).toBe(true);
    }
    for (const e of Object.keys(EVENT_SOUNDS)) expect(ALL_EVENTS, e).toContain(e);
    expect(new Set(ALL_EVENTS).size).toBe(ALL_EVENTS.length);
  });
  it('covers the whole event list from AGENTS.md section 15', () => {
    const spec = 'level_start launch node_added node_moved node_removed tug_placed slowmo_start slowmo_end closest_approach near_body mission_progress mission_complete crash lost timeout relay_link fuel_low window_map_open plan_requested plan_accepted assist_used hint coach_open coach_close coach_message report_open postcard_saved song_played ui_click ui_error tutorial_start tutorial_step_done tutorial_skipped tutorial_complete upgrade_bought mode_changed'.split(' ');
    for (const e of spec) expect(ALL_EVENTS).toContain(e);
  });
});

describe('events drive sounds', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1e9); });
  afterEach(() => { vi.useRealTimers(); });
  const rig = () => { const ctx = new MockAudioContext(), bus = createBus(); const audio = createAudio({ bus, createContext: () => ctx }); return { ctx, bus, audio }; };
  const tick = () => vi.setSystemTime(Date.now() + 5000);

  it('is silent and safe before the first gesture, then plays', () => {
    const { ctx, bus, audio } = rig();
    const base = ctx.nodes.length; // the destination node exists from the start
    expect(() => { bus.emit('ui_click'); bus.emit('crash', {}); bus.emit('launch', {}); }).not.toThrow();
    expect(ctx.nodes.length).toBe(base);
    audio.unlock();
    const n = ctx.nodes.length;
    bus.emit('ui_click');
    expect(ctx.nodes.length).toBeGreaterThan(n);
  });
  it('crash is a sub thump plus noise; delivery is five arpeggio notes; three stars ring three bells', () => {
    const { ctx, bus, audio } = rig(); audio.unlock(); const base = () => [ctx.all('osc').length, ctx.all('buffer').length];
    let [o, b] = base(); bus.emit('crash'); expect(ctx.all('osc').length - o).toBe(1); expect(ctx.all('buffer').length - b).toBe(1);
    [o] = base(); bus.emit('mission_complete'); expect(ctx.all('osc').length - o).toBe(5);
    [o] = base(); bus.emit('stars_awarded', { stars: 3 }); expect(ctx.all('osc').length - o).toBe(6); // 3 bells x 2 partials
    [o] = base(); tick(); bus.emit('stars_awarded', { stars: 1 }); expect(ctx.all('osc').length - o).toBe(2);
  });
  it('a node tick is pitched by the burn; a refused burn buzzes instead', () => {
    const { ctx, bus, audio } = rig(); audio.unlock();
    bus.emit('node_moved', { dv: 1.2, atLimit: false });
    const tickOsc = ctx.all('osc').at(-1);
    expect(tickOsc.type).toBe('triangle'); expect(dsp.inScale(tickOsc.frequency.calls[0][1])).toBe(true);
    tick(); bus.emit('node_moved', { atLimit: true });
    expect(ctx.all('osc').at(-1).type).toBe('sawtooth');
  });
  it('coach blips are throttled to one per 300 ms', () => {
    const { ctx, bus, audio } = rig(); audio.unlock(); tick();
    const n = () => ctx.all('osc').length, a = n();
    bus.emit('coach_message'); bus.emit('coach_message'); bus.emit('coach_message');
    expect(n() - a).toBe(1);
    vi.setSystemTime(Date.now() + 301); bus.emit('coach_message');
    expect(n() - a).toBe(2);
  });
  it('slow motion drives the master lowpass', () => {
    const { ctx, bus, audio } = rig(); audio.unlock();
    const lp = ctx.all('filter')[0];
    bus.emit('slowmo_start'); expect(lp.frequency.value).toBe(700);
    bus.emit('slowmo_end'); expect(lp.frequency.value).toBe(18000);
  });
  it('launch and node burns fire the thruster', () => {
    const { ctx, bus, audio } = rig(); audio.unlock();
    const state = { playing: true, frame: null, fuelFraction: 1, tank: 1, progress: 0, target: null };
    audio.update(state);
    bus.emit('launch', {}); ctx.advance(0.1); audio.update(state);
    expect(audio.ambience.layers.thrust.g.gain.value).toBeGreaterThan(0.1);
    ctx.advance(3); audio.update(state);
    bus.emit('node_burn', {}); ctx.advance(0.1); audio.update(state);
    expect(audio.ambience.layers.thrust.g.gain.value).toBeGreaterThan(0.1);
  });
  it('unsubscribes cleanly and mutes through the audio facade', () => {
    const { ctx, bus, audio } = rig(); audio.unlock();
    expect(audio.toggleMute()).toBe(true); expect(audio.toggleMute()).toBe(false);
    audio.dispose();
    const n = ctx.nodes.length; bus.emit('ui_click'); expect(ctx.nodes.length).toBe(n);
  });
  it('wireAudio only reacts once the engine is ready', () => {
    const bus = createBus(), ctx = new MockAudioContext(), engine = createAudioEngine({ createContext: () => ctx });
    wireAudio(bus, { engine, ambience: createAmbience(engine) });
    const base = ctx.nodes.length;
    bus.emit('ui_click'); expect(ctx.nodes.length).toBe(base);
  });
});

describe('voice pool', () => {
  it('reserved slots reduce capacity and prune frees finished voices', () => {
    const pool = new VoicePool(4); pool.reserve(3);
    expect(pool.add({ start: 0, end: 1, priority: 1, stop() {} }, 0)).toBe(true);
    expect(pool.add({ start: 0, end: 1, priority: 1, stop() {} }, 0)).toBe(false);
    expect(pool.add({ start: 2, end: 3, priority: 1, stop() {} }, 2)).toBe(true);
    expect(pool.count).toBe(4);
  });
});
