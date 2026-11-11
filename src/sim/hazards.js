import { TAU } from './constants.js';

/** Small deterministic random generator (mulberry32), so a seeded asteroid field is identical every run. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Asteroid field: a ring of small rocks on circular orbits around `parent`. They are on rails (nothing pulls on
 * them), do not pull on the probe, and crash it on contact. Collision uses a radial grid: rocks are bucketed by
 * orbit radius, so a query only looks at rocks whose orbit is within reach of the probe's distance from the parent.
 */
export const BUCKET_WIDTH = 0.25;
export function createAsteroidField(spec, byId) {
  const { parent, rIn, rOut, count, seed = 1, minSize = 0.06, maxSize = 0.16, dir = 1 } = spec;
  const mu = byId[parent].mu, rand = rng(seed);
  const rocks = [];
  for (let i = 0; i < count; i++) {
    const r = rIn + (rOut - rIn) * rand(), phase = rand() * TAU, u = rand();
    rocks.push({ r, phase, size: minSize + (maxSize - minSize) * u * u, n: dir * Math.sqrt(mu / (r * r * r)) });
  }
  const buckets = new Map();
  rocks.forEach((rock, i) => {
    const k = Math.floor((rock.r - rIn) / BUCKET_WIDTH);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  });
  const reach = Math.max(maxSize, ...rocks.map((x) => x.size));
  const posOf = (rock, px, pz, t) => { const a = rock.phase + rock.n * t; return [px + rock.r * Math.cos(a), pz + rock.r * Math.sin(a)]; };

  return {
    type: 'asteroids', parent, rIn, rOut, rocks,
    accel: () => [0, 0],
    /** Crash info if (x, z) is inside a rock at time t, else null. */
    collides(x, z, t) {
      const [px, pz] = byId[parent].pos(t), d = Math.hypot(x - px, z - pz);
      if (d < rIn - reach || d > rOut + reach) return null;
      const lo = Math.floor((d - reach - rIn) / BUCKET_WIDTH), hi = Math.floor((d + reach - rIn) / BUCKET_WIDTH);
      for (let k = lo; k <= hi; k++) {
        for (const i of buckets.get(k) ?? []) {
          const rock = rocks[i], [ax, az] = posOf(rock, px, pz, t);
          if (Math.hypot(x - ax, z - az) < rock.size) return { bodyId: 'asteroid', x, z };
        }
      }
      return null;
    },
    /** Every rock's position at time t (for drawing). */
    positionsAt(t) {
      const [px, pz] = byId[parent].pos(t);
      return rocks.map((rock) => posOf(rock, px, pz, t));
    },
    /** Reference implementation without the grid, used to test it. */
    collidesBrute(x, z, t) {
      const [px, pz] = byId[parent].pos(t);
      return rocks.some((rock) => { const [ax, az] = posOf(rock, px, pz, t); return Math.hypot(x - ax, z - az) < rock.size; });
    },
  };
}

/** Build hazard objects from level data. Dark masses are bodies, not hazards (see darkMassBody). */
export function createHazards(specs = [], byId) {
  const out = [];
  for (const s of specs) {
    if (s.type === 'asteroids') out.push(createAsteroidField(s, byId));
    else if (s.type === 'dark_mass') continue;
    else throw new Error(`unknown hazard type: ${s.type}`);
  }
  return out;
}
