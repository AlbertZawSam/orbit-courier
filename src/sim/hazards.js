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

/**
 * Solar wind: inside a circular zone the probe feels a constant push of size `strength`, whose direction turns at
 * `rotation` rad/s starting from `angle0`. The push fades smoothly over `edge` units at the zone's rim so the force
 * never jumps. With `parent` the zone moves with that body (x, z become an offset from it).
 */
export function createSolarWind(spec, byId) {
  const { x = 0, z = 0, radius, strength, angle0 = 0, rotation = 0.1, edge = 0.5, parent = null } = spec;
  const centre = (t) => { if (!parent) return [x, z]; const [px, pz] = byId[parent].pos(t); return [px + x, pz + z]; };
  return {
    type: 'solar_wind', x, z, radius, strength, angle0, rotation, edge, parent,
    angleAt: (t) => angle0 + rotation * t,
    /** 1 in the core, easing to 0 at the rim, 0 outside. */
    weight(px, pz, t) {
      const [cx, cz] = centre(t), d = Math.hypot(px - cx, pz - cz);
      const u = Math.min(1, Math.max(0, (radius - d) / edge));
      return u * u * (3 - 2 * u);
    },
    accel(px, pz, t) {
      const w = this.weight(px, pz, t);
      if (w === 0) return [0, 0];
      const a = angle0 + rotation * t;
      return [strength * w * Math.cos(a), strength * w * Math.sin(a)];
    },
    centreAt: centre,
  };
}

/** Build hazard objects from level data. Dark masses are bodies, not hazards (see darkMassBody). */
export function createHazards(specs = [], byId) {
  const out = [];
  for (const s of specs) {
    if (s.type === 'asteroids') out.push(createAsteroidField(s, byId));
    else if (s.type === 'solar_wind') out.push(createSolarWind(s, byId));
    else if (s.type === 'dark_mass') continue;
    else throw new Error(`unknown hazard type: ${s.type}`);
  }
  return out;
}
