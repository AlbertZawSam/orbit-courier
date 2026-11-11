import { vCirc, vEsc, period, hohmann } from '../sim/calc.js';
import { PAD_CLEARANCE } from '../sim/constants.js';

const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(1) : x.toFixed(2));

/** Which calculator, if any, a question asks for. */
export function detectCalc(q) {
  q = q.toLowerCase();
  if (/hohmann|how (much|many) (dv|delta|fuel)|delta[- ]?v (needed|to|for)|\bdv\b (needed|to|for)/.test(q)) return 'dv';
  if (/escape (speed|velocity)|speed to escape/.test(q)) return 'vesc';
  if (/(circular|orbit(al)?) (speed|velocity)|speed (for|of|to (hold|keep|stay in)) .*orbit|what speed/.test(q)) return 'vcirc';
  if (/\bperiod\b|how long (is|does) (one|an|a) (orbit|lap)|lap time/.test(q)) return 'period';
  return null;
}

/** Pick the body a question is about: one it names, otherwise the mission target. */
function pickBody(q, level, sys) {
  const lower = q.toLowerCase();
  for (const b of sys.bodies) if (lower.includes((b.name ?? b.id).toLowerCase()) || lower.includes(b.id)) return b;
  return sys.byId[level.mission.target];
}

function defaultRadius(body, level) {
  if (body.id === level.mission.target && level.mission.type === 'deliver_orbit') return (level.mission.rMin + level.mission.rMax) / 2;
  if (body.id === level.launch.padBody) return body.radius * PAD_CLEARANCE;
  return body.radius * 3;
}

/**
 * Answer a calculator question from the current level's real numbers.
 * @returns {{kind:string, body:object, r:number, lines:string[], value:number, numbers:object, sources:string[]}}
 */
export function answerCalc(kind, question, { level, sys }) {
  const body = pickBody(question, level, sys);
  const nums = [...question.matchAll(/(?:r\s*=?\s*|radius\s*|distance\s*|at\s+|from\s+|to\s+)(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1]));
  const name = body.name ?? body.id;
  const where = (r) => `${fmt(r)} units from ${name}`;
  if (kind === 'dv') {
    const orbit = level.mission.type === 'deliver_orbit';
    const [r1, r2] = nums.length >= 2 ? nums : orbit ? [level.mission.rMin, level.mission.rMax] : [body.radius * 1.5, body.radius * 4];
    const h = hohmann(body.mu, r1, r2);
    return { kind, body, r: r1, value: h.total, numbers: { ...h, r1, r2 },
      lines: [`Hohmann transfer around ${name} (mu ${body.mu}) from r = ${fmt(r1)} to r = ${fmt(r2)}: first burn ${fmt(h.dv1)}, second burn ${fmt(h.dv2)}, total delta-v ${fmt(h.total)}, taking ${fmt(h.transferTime)} s.`],
      sources: ['MA-002', 'BA-004'] };
  }
  const r = nums[0] ?? defaultRadius(body, level);
  if (kind === 'vesc') {
    const v = vEsc(body.mu, r);
    return { kind, body, r, value: v, numbers: { mu: body.mu, r },
      lines: [`Escape speed = sqrt(2 x mu / r) = sqrt(2 x ${body.mu} / ${fmt(r)}) = ${fmt(v)} at ${where(r)}.`], sources: ['OR-003'] };
  }
  if (kind === 'period') {
    const T = period(body.mu, r);
    return { kind, body, r, value: T, numbers: { mu: body.mu, r },
      lines: [`Orbital period = 2 x pi x sqrt(r^3 / mu) = 2 x pi x sqrt(${fmt(r)}^3 / ${body.mu}) = ${fmt(T)} s for a circular orbit ${where(r)}.`], sources: ['OR-005'] };
  }
  const v = vCirc(body.mu, r);
  return { kind: 'vcirc', body, r, value: v, numbers: { mu: body.mu, r },
    lines: [`Circular speed = sqrt(mu / r) = sqrt(${body.mu} / ${fmt(r)}) = ${fmt(v)} at ${where(r)}. Escape speed there is ${fmt(vEsc(body.mu, r))}.`], sources: ['OR-002', 'OR-003'] };
}
