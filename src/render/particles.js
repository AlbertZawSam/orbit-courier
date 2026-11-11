// Pure particle pool and emitters (no three.js). Effects are photosensitivity-safe by construction:
// brightness only ever falls over a particle's life, no particle lives under 0.5 s, and emission is smooth.

export const MIN_LIFE = 0.5;
/** Alpha over normalised age (0..1): strictly non-increasing, so nothing ever flickers or flashes. */
export const fade = (u) => { const k = Math.min(1, Math.max(0, 1 - u)); return k * Math.sqrt(k); };

export class ParticlePool {
  constructor(max) {
    this.max = max;
    this.x = new Float32Array(max); this.z = new Float32Array(max);
    this.vx = new Float32Array(max); this.vz = new Float32Array(max);
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.size = new Float32Array(max);
    this.color = new Float32Array(max * 3); this.alive = new Uint8Array(max);
    this.drag = new Float32Array(max);
    this.cursor = 0;
  }
  get count() { let n = 0; for (let i = 0; i < this.max; i++) n += this.alive[i]; return n; }
  /** Spawn one particle into a free slot; returns false (and drops it) when the pool is full. */
  spawn({ x, z, vx, vz, life, size, color, drag = 1.5 }) {
    for (let k = 0; k < this.max; k++) {
      const i = (this.cursor + k) % this.max;
      if (this.alive[i]) continue;
      this.x[i] = x; this.z[i] = z; this.vx[i] = vx; this.vz[i] = vz;
      this.age[i] = 0; this.life[i] = Math.max(MIN_LIFE, life); this.size[i] = size; this.drag[i] = drag;
      this.color.set(color, i * 3); this.alive[i] = 1; this.cursor = (i + 1) % this.max;
      return true;
    }
    return false;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.alive[i] = 0; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= k; this.vz[i] *= k;
      this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt;
    }
  }
  clear() { this.alive.fill(0); }
  setMax(max) { if (max === this.max) return this; const next = new ParticlePool(max); for (let i = 0; i < Math.min(max, this.max); i++) if (this.alive[i]) next.spawn({ x: this.x[i], z: this.z[i], vx: this.vx[i], vz: this.vz[i], life: this.life[i], size: this.size[i], color: this.color.subarray(i * 3, i * 3 + 3) }); return next; }
}

const WARM = [1.0, 0.72, 0.3], HOT = [1.0, 0.92, 0.75], TEAL = [0.31, 0.82, 0.77], GOLD = [0.95, 0.76, 0.31], RED = [0.94, 0.38, 0.24];

/** Thruster plume: particles thrown opposite to the burn direction, in a narrow cone. */
export function thrustParticles({ x, z, dir }, count, rand = Math.random) {
  const out = [], base = Math.atan2(-dir[1], -dir[0]);
  for (let k = 0; k < count; k++) {
    const a = base + (rand() - 0.5) * 0.7, sp = 2.2 + rand() * 2.2;
    out.push({ x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: 0.55 + rand() * 0.4, size: 0.1 + rand() * 0.1, color: rand() < 0.35 ? HOT : WARM, drag: 2.2 });
  }
  return out;
}

/** Crash (orange and red) or delivery (teal and gold) burst: a soft radial spray. */
export function burstParticles(kind, { x, z }, count, rand = Math.random) {
  const palette = kind === 'crash' ? [RED, WARM, HOT] : [TEAL, GOLD, HOT];
  const out = [];
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2, sp = (kind === 'crash' ? 1.2 : 0.8) + rand() * (kind === 'crash' ? 3.2 : 2.4);
    out.push({ x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: 0.9 + rand() * 0.7, size: 0.1 + rand() * 0.14, color: palette[Math.floor(rand() * palette.length)], drag: 1.6 });
  }
  return out;
}
