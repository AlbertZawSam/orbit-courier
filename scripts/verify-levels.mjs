// Replays every stored level solution headlessly with the game's own Flight. A failing solution means the
// level is broken: fix the level design, not this script.
import { LEVELS } from '../src/levels/levels.js';
import { validateLevel } from '../src/levels/schema.js';
import { replay } from '../src/game/replay.js';

let failed = 0;
const rows = [];
for (const level of LEVELS) {
  const problems = validateLevel(level);
  const r = replay(level, level.solution);
  if (r.outcome !== 'delivered') problems.push(`${level.id}: stored solution ends in "${r.outcome}", not "delivered"`);
  if (r.fuelUsed > level.fuel + 1e-9) problems.push(`${level.id}: solution burns ${r.fuelUsed.toFixed(3)} but the level has ${level.fuel} fuel`);
  if (Math.abs(r.fuelUsed - level.par.fuel) > 0.005) problems.push(`${level.id}: par.fuel ${level.par.fuel} does not match the solution's fuel use ${r.fuelUsed.toFixed(3)}`);
  rows.push(`${level.id.padEnd(4)} ${level.name.padEnd(16)} ${r.outcome.padEnd(10)} t=${r.t.toFixed(1).padStart(5)} s  fuel ${r.fuelUsed.toFixed(2)} / par ${level.par.fuel.toFixed(2)} / tank ${level.fuel.toFixed(2)}`);
  for (const p of problems) { console.error('  ✗ ' + p); failed++; }
}
console.log(rows.join('\n'));
if (failed) { console.error(`verify-levels FAILED: ${failed} problem(s)`); process.exit(1); }
console.log(`verify-levels OK: ${LEVELS.length} level(s)`);
