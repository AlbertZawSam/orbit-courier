import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/levels/levels.js';
import { validateLevel } from '../src/levels/schema.js';
import { replay } from '../src/game/replay.js';
import { scoreAttempt, starsFor, ASSIST_PAYOUT } from '../src/sim/scoring.js';

describe('levels', () => {
  it('has unique ids in order', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('L1');
  });
  for (const level of LEVELS) {
    describe(level.id + ' ' + level.name, () => {
      it('matches the schema', () => { expect(validateLevel(level)).toEqual([]); });
      it('stored solution delivers within fuel and node limits', () => {
        const r = replay(level, level.solution);
        expect(r.outcome).toBe('delivered');
        expect(r.fuelUsed).toBeLessThanOrEqual(level.fuel + 1e-9);
        expect(level.solution.nodes.length).toBeLessThanOrEqual(level.maxNodes);
      });
      it('par.fuel equals the solution fuel use', () => {
        expect(Math.abs(replay(level, level.solution).fuelUsed - level.par.fuel)).toBeLessThan(0.005);
      });
      it('replay is deterministic', () => {
        const a = replay(level, level.solution), b = replay(level, level.solution);
        expect(b).toEqual(a);
      });
      if (level.solution.nodes.length > 0) {
        it('needs its burn node: the same launch alone does not deliver', () => {
          const r = replay(level, { launch: level.solution.launch, nodes: [] }, { maxSeconds: 60 });
          expect(r.outcome).not.toBe('delivered');
        });
        it('tolerates node timing errors of a few tenths of a second', () => {
          for (const dt of [-0.3, 0.3]) {
            const nodes = level.solution.nodes.map((n) => ({ ...n, t: n.t + dt }));
            expect(replay(level, { launch: level.solution.launch, nodes }).outcome).toBe('delivered');
          }
        });
      }
      it('a launch straight into the pad body crashes instead of passing', () => {
        const r = replay(level, { launch: { angle: 0, power: 0, t0: 0 }, nodes: [] }, { maxSeconds: 30 });
        expect(r.outcome).toBe('crash');
      });
    });
  }
  it('schema rejects broken levels', () => {
    const bad = { ...LEVELS[0], hints: ['only one'], mission: { ...LEVELS[0].mission, target: 'nowhere' }, solution: { ...LEVELS[0].solution, nodes: [{ t: 1, dv: [0, 0] }, { t: 2, dv: [0, 0] }] } };
    const errors = validateLevel(bad).join('\n');
    expect(errors).toMatch(/3 non-empty hints/);
    expect(errors).toMatch(/mission.target/);
    expect(errors).toMatch(/more nodes than maxNodes/);
  });
});

describe('scoring', () => {
  const level = { tier: 'training', fuel: 2, par: { fuel: 1 } };
  const win = (fuelUsed, seconds = 10) => ({ outcome: 'delivered', fuelUsed, seconds });
  it('awards 3 stars at par, 2 within 25%, 1 beyond', () => {
    expect(starsFor(1, 1)).toBe(3);
    expect(starsFor(1, 1.2)).toBe(2);
    expect(starsFor(1, 1.25)).toBe(2);
    expect(starsFor(1, 1.6)).toBe(1);
  });
  it('earns stars on a zero-fuel par with a small tolerance', () => {
    expect(starsFor(0, 0)).toBe(3);
    expect(starsFor(0, 0.015)).toBe(3);
    expect(starsFor(0, 0.1)).toBe(1);
  });
  it('caps assisted attempts at 2 stars and pays 60%', () => {
    expect(starsFor(1, 0.5, { assisted: true })).toBe(2);
    const plain = scoreAttempt(level, win(1)), assisted = scoreAttempt(level, win(1), { assisted: true });
    expect(assisted.payout).toBe(Math.round(plain.payout * ASSIST_PAYOUT));
    expect(assisted.stars).toBe(2);
  });
  it('pays more for leftover fuel and speed, and nothing for a failure', () => {
    expect(scoreAttempt(level, win(0.5)).payout).toBeGreaterThan(scoreAttempt(level, win(1.5)).payout);
    expect(scoreAttempt(level, win(1, 5)).payout).toBeGreaterThan(scoreAttempt(level, win(1, 25)).payout);
    expect(scoreAttempt(level, { outcome: 'crash', fuelUsed: 0, seconds: 3 })).toMatchObject({ stars: 0, payout: 0 });
  });
});
