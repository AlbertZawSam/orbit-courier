/**
 * Voice budget: at most `max` sounds at once. Persistent layers reserve slots; a new sound that cannot fit
 * either steals a lower-priority voice or is dropped.
 */
export class VoicePool {
  constructor(max = 24) { this.max = max; this.voices = []; this.reserved = 0; }
  get count() { return this.voices.length + this.reserved; }
  reserve(n) { this.reserved += n; }
  prune(now) { this.voices = this.voices.filter((v) => v.end > now); }
  add(voice, now) {
    this.prune(now);
    if (this.count < this.max) { this.voices.push(voice); return true; }
    let victim = null;
    for (const v of this.voices) if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start)) victim = v;
    if (victim && victim.priority < voice.priority) {
      try { victim.stop(); } catch { /* already stopped */ }
      this.voices.splice(this.voices.indexOf(victim), 1);
      this.voices.push(voice);
      return true;
    }
    return false;
  }
}

/**
 * Web Audio engine. The context is only created on the first user gesture (`unlock`), so browsers allow it,
 * and every method is a safe no-op until then (or when Web Audio is missing).
 * Bus graph: sfx, thrust, hum, music, ui -> master (trim) -> time-dilation lowpass -> destination.
 */
export function createAudioEngine({ createContext = defaultContext, maxVoices = 24 } = {}) {
  let ctx = null, master = null, dilation = null, analyser = null, noise = null;
  const buses = {}, pool = new VoicePool(maxVoices);
  let muted = false, volume = 0.8, slow = false, resumed = Promise.resolve(), key = 45;
  const busLevels = {}; // wanted bus gains, remembered so settings made before the first gesture still apply

  function build() {
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume;
    dilation = ctx.createBiquadFilter(); dilation.type = 'lowpass'; dilation.frequency.value = 18000; dilation.Q.value = 0.7;
    master.connect(dilation); dilation.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; master.connect(analyser); // a tap for level checks; makes no sound
    for (const name of ['sfx', 'thrust', 'hum', 'music', 'ui']) { const g = ctx.createGain(); g.gain.value = busLevels[name] ?? 1; g.connect(master); buses[name] = g; }
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noise = buf;
  }

  const api = {
    pool, buses,
    get ready() { return ctx !== null; },
    get muted() { return muted; },
    get context() { return ctx; },
    /** True once the context is actually running (browsers ignore resume() without a real user activation). */
    get running() { return ctx !== null && ctx.state === 'running'; },
    /** Settles when the latest resume attempt has finished. */
    get resumed() { return resumed; },
    now: () => (ctx ? ctx.currentTime : 0),
    /** Create (once) and resume the context. Call from a user gesture. Returns false if Web Audio is unavailable. */
    unlock() {
      if (!ctx) {
        try { ctx = createContext(); } catch { ctx = null; }
        if (!ctx) return false;
        build();
      }
      if (ctx.state === 'suspended') resumed = Promise.resolve(ctx.resume?.()).catch(() => {});
      return true;
    },
    noiseBuffer: () => noise,
    /**
     * Play a short sound. `build(ctx, t, buses)` creates the nodes starting at time t and returns the sources it
     * started (so they can be stopped if the voice is stolen). Returns false when dropped.
     */
    voice(duration, priority, build, delay = 0) {
      if (!ctx) return false;
      const t = ctx.currentTime + delay;
      const sources = [];
      const voice = { start: t, end: t + duration + 0.05, priority, stop: () => sources.forEach((s) => s.stop?.(ctx.currentTime)) };
      if (!pool.add(voice, ctx.currentTime)) return false;
      sources.push(...(build(ctx, t, buses) ?? []));
      return true;
    },
    setMuted(m) {
      muted = !!m;
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
    },
    /** Set a bus's level (0..1); remembered until the context exists. */
    setBusGain(name, v) {
      busLevels[name] = Math.min(1, Math.max(0, v));
      if (ctx && buses[name]) buses[name].gain.setTargetAtTime(busLevels[name], ctx.currentTime, 0.05);
    },
    /** Stop all processing (a hidden tab) and start it again. Safe before the context exists. */
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend?.(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume?.(); },
    setVolume(v) { volume = Math.min(1, Math.max(0, v)); if (ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03); },
    /** Slow motion closes the master lowpass; leaving it opens it again. */
    setSlow(active, cutoffs = { on: 700, off: 18000 }) {
      slow = !!active;
      if (ctx) dilation.frequency.setTargetAtTime(slow ? cutoffs.on : cutoffs.off, ctx.currentTime, 0.12);
    },
    get slow() { return slow; },
    /** The musical key (MIDI root) every pitch mapping snaps to; the music sets it from the tier. */
    get key() { return key; },
    setKey(root) { key = root; },
    /** RMS level (0..1) of the master output right now, for diagnostics. */
    level() {
      if (!analyser) return 0;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let s = 0; for (const x of data) s += x * x;
      return Math.sqrt(s / data.length);
    },
  };
  return api;
}

function defaultContext() {
  const C = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!C) throw new Error('no Web Audio');
  return new C();
}
