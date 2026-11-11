import { vEsc } from '../sim/calc.js';
import { PAD_CLEARANCE } from '../sim/constants.js';

const pct = (x) => Math.round(x);

/**
 * Launch-log findings (AGENTS.md 16.4): up to 3 things the player did well and 3 to improve, each with a
 * retrieval query so a guide citation is attached. Fallback tips fill any gaps so there are always 3 + 3.
 */
export function buildFindings(s, level, sys) {
  const nameOf = (id) => sys.byId[id]?.name ?? id;
  const target = nameOf(level.mission.target);
  const pad = sys.byId[level.launch.padBody];
  const par = level.par.fuel;
  const improve = [], good = [];

  const crash = s.repeatedOutcome?.outcome.startsWith('crash:') ? s.repeatedOutcome : null;
  if (crash) improve.push({ text: `You crashed into ${nameOf(crash.outcome.split(':')[1])} ${crash.count} times. Raise your closest point with a prograde burn on the far side of the path, or aim to pass farther away.`, query: 'crash periapsis raise burn' });
  const vEscPad = vEsc(pad.mu, pad.radius * PAD_CLEARANCE);
  if ((s.outcomes.lost ?? 0) > 0 && s.lastLaunch && s.lastLaunch.power >= vEscPad) {
    const n = Math.max(1, pct(100 * (1 - (0.92 * vEscPad) / s.lastLaunch.power)));
    improve.push({ text: `Your last launch used power ${s.lastLaunch.power.toFixed(2)}, above the escape speed of ${vEscPad.toFixed(2)} from ${nameOf(pad.id)}. Try about ${n}% less.`, query: 'leave the map too fast escape power' });
  }
  if (s.delivered > 0 && s.parRatio !== null && s.parRatio > 1.5) {
    improve.push({ text: `Your best run used ${s.bestFuel.toFixed(2)} fuel, more than 1.5 times par (${par.toFixed(2)}). A gravity assist or a smaller burn can save fuel.`, query: 'save fuel gravity assist' });
  }
  if (s.attempts >= 4 && s.failures >= 2 && s.angleSpreadDeg < 3) {
    improve.push({ text: `Your ${s.attempts} launches used almost the same angle (spread ${s.angleSpreadDeg.toFixed(1)} degrees). Try a larger change in angle or power.`, query: 'launch angle power adjust' });
  }
  if (s.failures >= 2 && s.nodeAttempts === 0 && level.maxNodes > 0) {
    improve.push({ text: 'You have not used a burn node on this level yet. A small burn can fix a path that almost works.', query: 'burn node add drag' });
  }
  if (s.failures >= 2 && s.slowmoSeconds === 0 && s.nodeAttempts > 0) {
    improve.push({ text: 'You have not used slow motion. It makes placing a burn near a close pass much easier.', query: 'slow motion planning' });
  }
  if (s.delivered === 0 && s.closestToTarget !== null && s.closestToTarget > level.mission.rMax * 2) {
    improve.push({ text: `Your closest approach to ${target} was ${s.closestToTarget.toFixed(1)} units, far outside the band (${level.mission.rMax}). Aim to pass nearer to it.`, query: 'flying past the target aim' });
  }
  const fallbackImprove = [
    { text: 'Change one thing at a time and read the preview. Shift with the arrow keys gives fine steps.', query: 'fine adjustments shift keys' },
    { text: 'Look for the orange ring on the preview before you launch: it marks a crash.', query: 'preview line crash marker' },
    { text: 'Use slow motion to place a burn precisely near a close pass.', query: 'slow motion planning' },
  ];

  if (s.delivered > 0) good.push({ text: `You delivered the cargo on this level in ${s.attempts} attempt${s.attempts === 1 ? '' : 's'}.`, query: 'deliver orbit mission win' });
  if (s.bestFuel !== null && s.bestFuel <= par + 0.02) good.push({ text: `You matched par fuel (${par.toFixed(2)}), which earns three stars.`, query: 'stars payout par fuel' });
  if (s.nodeAttempts > 0) good.push({ text: 'You used burn nodes to shape your path.', query: 'burn node add drag' });
  if (s.previewUsed) good.push({ text: 'You checked the preview line, which matches the real flight exactly.', query: 'preview line trajectory' });
  if (s.attempts > 0 && !Object.keys(s.outcomes).some((o) => o.startsWith('crash:'))) good.push({ text: 'No crashes so far: your launches keep a safe distance from the bodies.', query: 'crash collision surface' });
  if (s.closestToTarget !== null && s.closestToTarget <= level.mission.rMax * 1.5) good.push({ text: `Your closest pass to ${target} was ${s.closestToTarget.toFixed(1)} units, close to the band.`, query: 'orbit band hold mission' });
  if (s.attempts >= 3) good.push({ text: `You kept experimenting: ${s.attempts} attempts logged on this level.`, query: 'launch angle power practice' });
  const fallbackGood = [
    { text: 'You are learning with every attempt: each preview teaches the shape of an orbit.', query: 'preview line trajectory' },
    { text: 'Launching is free, so every attempt costs nothing but time.', query: 'fuel delta-v burn cost' },
    { text: 'You are using the same controls the stored solutions use: aim, then adjust.', query: 'controls aim launch' },
  ];

  const take = (list, fall) => {
    const seen = new Set(), out = [];
    for (const f of [...list, ...fall]) if (!seen.has(f.text) && out.length < 3) { seen.add(f.text); out.push(f); }
    return out;
  };
  return { good: take(good, fallbackGood), improve: take(improve, fallbackImprove) };
}
