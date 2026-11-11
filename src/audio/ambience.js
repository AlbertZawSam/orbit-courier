import { humFreq, humGain, dopplerFactor, dopplerGain, pingInterval, thrustEnvelope, thrustCutoff, shimmerFreq, lowFuel } from './dsp.js';
import { sfx } from './sfx.js';

const HUM_SLOTS = 2;
const RESERVED = 2 + HUM_SLOTS * 2 + 1 + 2; // thrust (noise + saw), hum pairs, doppler noise, shimmer pair

/**
 * Continuous layers, created once the context exists: thruster, two gravity hums, Doppler swoosh,
 * orbit-lock shimmer. `update` runs every frame; parameters glide with setTargetAtTime so nothing clicks.
 */
export function createAmbience(engine) {
  let built = false, thrust = null, hum = [], doppler = null, shimmer = null;
  let thrustUntil = { start: -1, duration: 0 }, nextPing = 0, nextFuelPulse = 0;

  function build() {
    const ctx = engine.context, b = engine.buses;
    engine.pool.reserve(RESERVED);
    const src = ctx.createBufferSource(); src.buffer = engine.noiseBuffer(); src.loop = true;
    const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 62;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); saw.connect(lp); lp.connect(g); g.connect(b.thrust);
    src.start(); saw.start();
    thrust = { g, lp };

    hum = Array.from({ length: HUM_SLOTS }, () => {
      const a = ctx.createOscillator(), c = ctx.createOscillator(), hg = ctx.createGain();
      a.type = 'sine'; c.type = 'triangle'; c.detune.value = 7; hg.gain.value = 0;
      a.connect(hg); c.connect(hg); hg.connect(b.hum); a.start(); c.start();
      return { a, c, g: hg };
    });

    const ns = ctx.createBufferSource(); ns.buffer = engine.noiseBuffer(); ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
    const dg = ctx.createGain(); dg.gain.value = 0;
    ns.connect(bp); bp.connect(dg); dg.connect(b.sfx); ns.start();
    doppler = { bp, g: dg };

    const s1 = ctx.createOscillator(), s2 = ctx.createOscillator(), sg = ctx.createGain();
    s1.type = 'sine'; s2.type = 'sine'; s2.detune.value = 9; sg.gain.value = 0;
    s1.connect(sg); s2.connect(sg); sg.connect(b.sfx); s1.start(); s2.start();
    shimmer = { s1, s2, g: sg };
    built = true;
  }

  const glide = (param, value, now, tc = 0.08) => param.setTargetAtTime(value, now, tc);

  return {
    /** A thruster plume for `duration` seconds (launch or a node burn). */
    thrustBurst(duration) { thrustUntil = { start: engine.now(), duration }; },
    /**
     * @param {{playing:boolean, frame:object|null, fuelFraction:number, tank:number, progress:number, target:object|null}} s
     * `frame` comes from audioFrame(): the two strongest pulls, the Doppler source and the target distance.
     */
    update(s) {
      if (!engine.ready) return;
      if (!built) build();
      const ctx = engine.context, now = ctx.currentTime;
      const level = thrustEnvelope(now - thrustUntil.start, thrustUntil.duration);
      glide(thrust.g.gain, level * 0.16, now, 0.03); glide(thrust.lp.frequency, thrustCutoff(level), now, 0.04);

      const f = s.playing ? s.frame : null;
      hum.forEach((h, k) => {
        const body = f?.hum[k];
        if (!body) { glide(h.g.gain, 0, now); return; }
        const fr = humFreq(body.accel, body.kind);
        glide(h.a.frequency, fr, now, 0.15); glide(h.c.frequency, fr * 2, now, 0.15);
        glide(h.g.gain, humGain(body.accel) * (k === 0 ? 0.11 : 0.06), now, 0.2);
      });

      const d = f?.doppler;
      if (d) {
        glide(doppler.bp.frequency, 900 * dopplerFactor(d.closing), now, 0.05);
        glide(doppler.g.gain, dopplerGain(d.speed, Math.max(0, d.r - d.radius)) * 0.22, now, 0.1);
      } else glide(doppler.g.gain, 0, now);

      const p = s.playing ? s.progress : 0;
      glide(shimmer.g.gain, p > 0.001 ? 0.03 + 0.05 * p : 0, now, 0.25);
      if (p > 0.001) { glide(shimmer.s1.frequency, shimmerFreq(p), now, 0.2); glide(shimmer.s2.frequency, shimmerFreq(p) * 1.5, now, 0.2); }

      if (s.playing && f?.target && now >= nextPing) { sfx.ping(engine, f.target.r); nextPing = now + pingInterval(f.target.r); }
      if (s.playing && lowFuel(s.fuelFraction, s.tank) && now >= nextFuelPulse) { sfx.lowFuel(engine); nextFuelPulse = now + 1.6; }
    },
    get built() { return built; },
    get layers() { return { thrust, hum, doppler, shimmer }; }, // for diagnostics and tests
    reserved: RESERVED,
  };
}
