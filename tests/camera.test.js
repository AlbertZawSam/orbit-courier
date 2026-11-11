import { describe, it, expect } from 'vitest';
import { CameraRig, PLAN_PITCH, DIST_MUL, YAW0, BASE_FOV, SLOW_FOV_KICK, CINEMATIC_SECONDS, ORBIT_YAW_LIMIT, PITCH_MIN, PITCH_MAX, DIST_MIN, DIST_MAX, MODES_BY_PHASE } from '../src/render/cameraRig.js';

const probe = (x = 10, z = 5, vx = 2, vz = 0) => ({ x, z, vx, vz });
const run = (rig, seconds, ctx = {}, dt = 1 / 60) => { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) rig.update(dt, ctx); };
const make = (reduced = false, onMode = null) => new CameraRig({ reducedMotion: () => reduced, onMode });

describe('plan view', () => {
  it('reproduces the original planning camera: eye at (x, 0.9 dist, z + 0.45 dist)', () => {
    const rig = make(); rig.snap(3, -4);
    const c = rig.compute();
    expect(c.position[0]).toBeCloseTo(3, 9);
    expect(c.position[1]).toBeCloseTo(0.9 * 15, 9);
    expect(c.position[2]).toBeCloseTo(-4 + 0.45 * 15, 9);
    expect(c.target).toEqual([3, 0, -4]);
    expect(c.fov).toBe(BASE_FOV);
    expect(Math.hypot(0.9, 0.45)).toBeCloseTo(DIST_MUL, 12);
    expect(PLAN_PITCH).toBeCloseTo(1.1071, 3);
  });
  it('frame() fits exactly on reset and only zooms out afterwards', () => {
    const rig = make();
    rig.frame({ minX: 0, maxX: 20, minZ: 0, maxZ: 5 }, true);
    const fitted = rig.userDist;
    expect(fitted).toBeCloseTo(20 / (1.65 * 0.62), 9);
    rig.frame({ minX: 0, maxX: 4, minZ: 0, maxZ: 3 }, false);   // smaller: no zoom in
    expect(rig.userDist).toBe(fitted);
    rig.frame({ minX: 0, maxX: 60, minZ: 0, maxZ: 5 }, false);  // bigger: zoom out
    expect(rig.userDist).toBeGreaterThan(fitted);
    rig.frame({ minX: 0, maxX: 1e5, minZ: 0, maxZ: 1 }, true);
    expect(rig.userDist).toBe(DIST_MAX);
    expect(rig.planTarget.x).toBeCloseTo(5e4, 6);
  });
  it('zoom is clamped', () => {
    const rig = make();
    for (let i = 0; i < 60; i++) rig.zoom(0.5);
    expect(rig.userDist).toBe(DIST_MIN);
    for (let i = 0; i < 60; i++) rig.zoom(2);
    expect(rig.userDist).toBe(DIST_MAX);
  });
});

describe('damping', () => {
  it('approaches its goal without overshooting and without jumping', () => {
    const rig = make(); rig.snap(0, 0); rig.setPlanTarget(30, 0);
    let prev = 0, maxStep = 0;
    for (let i = 0; i < 600; i++) {
      rig.update(1 / 60);
      expect(rig.cur.x).toBeLessThanOrEqual(30 + 1e-9);
      expect(rig.cur.x).toBeGreaterThanOrEqual(prev - 1e-9);
      maxStep = Math.max(maxStep, rig.cur.x - prev); prev = rig.cur.x;
    }
    expect(rig.cur.x).toBeCloseTo(30, 3);
    expect(maxStep).toBeLessThan(30 * 0.1); // never more than a tenth of the way in one frame
  });
  it('is frame-rate independent for the same elapsed time', () => {
    const a = make(), b = make();
    a.setPlanTarget(20, 0); b.setPlanTarget(20, 0);
    run(a, 0.5, {}, 1 / 30); run(b, 0.5, {}, 1 / 120);
    expect(a.cur.x).toBeCloseTo(b.cur.x, 2);
  });
});

describe('follow, focus and overview', () => {
  it('follow chases the probe', () => {
    const rig = make(); rig.setMode('follow');
    run(rig, 3, { probe: probe(12, -7) });
    expect(rig.cur.x).toBeCloseTo(12, 2); expect(rig.cur.z).toBeCloseTo(-7, 2);
  });
  it('focus tracks a moving body and keeps a sensible distance', () => {
    const rig = make(); rig.setMode('focus', { focusId: 'moon' });
    let t = 0;
    const ctx = { focus: () => ({ x: 5 + t, z: 2, radius: 0.5 }) };
    for (let i = 0; i < 300; i++) { t += 1 / 60; rig.update(1 / 60, ctx); }
    expect(rig.cur.x).toBeCloseTo(5 + t, 0);
    expect(rig.goal.dist).toBeGreaterThanOrEqual(5);
    expect(rig.goal.dist).toBeLessThanOrEqual(rig.userDist);
    const noBody = make(); noBody.setMode('focus', { focusId: 'x' });
    expect(() => run(noBody, 0.2, { focus: () => null })).not.toThrow();
  });
  it('overview is wider than the plan view', () => {
    const rig = make(); rig.userDist = 20; rig.setMode('overview');
    run(rig, 4, {});
    expect(rig.cur.dist).toBeGreaterThan(30);
  });
});

describe('limited orbit', () => {
  it('turns follow into orbit and clamps yaw and pitch', () => {
    const rig = make(); rig.setMode('follow');
    rig.orbitBy(10, 0);
    expect(rig.mode).toBe('orbit');
    rig.orbitBy(100000, 100000);
    expect(Math.abs(rig.orbit.yaw)).toBeLessThanOrEqual(ORBIT_YAW_LIMIT + 1e-12);
    rig.orbitBy(-1e9, -1e9);
    expect(Math.abs(rig.orbit.yaw)).toBeLessThanOrEqual(ORBIT_YAW_LIMIT + 1e-12);
    run(rig, 4, { probe: probe() });
    expect(rig.cur.pitch).toBeGreaterThanOrEqual(PITCH_MIN - 1e-6);
    expect(rig.cur.pitch).toBeLessThanOrEqual(PITCH_MAX + 1e-6);
  });
  it('is ignored outside follow and orbit, and resets when leaving orbit', () => {
    const rig = make(); rig.setMode('plan');
    rig.orbitBy(50, 50);
    expect(rig.mode).toBe('plan');
    expect(rig.orbit).toEqual({ yaw: 0, pitch: 0 });
    rig.setMode('follow'); rig.orbitBy(50, 20);
    expect(rig.mode).toBe('orbit');
    expect(rig.orbit.yaw).not.toBe(0);
    rig.setMode('follow');
    expect(rig.mode).toBe('follow');
    expect(rig.orbit).toEqual({ yaw: 0, pitch: 0 }); // leaving orbit forgets the offsets
  });
});

describe('cinematic launch', () => {
  it('starts low and close, then settles into follow after 3 seconds', () => {
    const modes = [], rig = make(false, (m) => modes.push(m));
    rig.userDist = 15; rig.snap(0, 0);
    rig.setMode('cinematic');
    rig.update(1 / 60, { probe: probe(0, 0) });
    expect(rig.goal.dist).toBeLessThan(7);
    expect(rig.goal.pitch).toBeLessThan(PLAN_PITCH - 0.4);
    expect(rig.goal.yaw).toBeLessThan(YAW0 - 0.5);
    run(rig, CINEMATIC_SECONDS - 0.1, { probe: probe(0, 0) });
    expect(rig.mode).toBe('cinematic');
    run(rig, 0.3, { probe: probe(0, 0) });
    expect(rig.mode).toBe('follow');
    expect(modes).toEqual(['cinematic', 'follow']);
    run(rig, 4, { probe: probe(0, 0) });
    expect(rig.cur.dist).toBeCloseTo(15, 1);
    expect(rig.cur.yaw).toBeCloseTo(YAW0, 2);
  });
  it('is skipped under reduced motion', () => {
    const rig = make(true); rig.setMode('cinematic');
    expect(rig.mode).toBe('follow');
  });
});

describe('slow motion field-of-view kick', () => {
  it('widens in slow motion, returns afterwards, and is off under reduced motion', () => {
    const rig = make(); rig.setMode('follow');
    run(rig, 2, { probe: probe(), slow: true });
    expect(rig.cur.fov).toBeCloseTo(BASE_FOV + SLOW_FOV_KICK, 1);
    run(rig, 2, { probe: probe(), slow: false });
    expect(rig.cur.fov).toBeCloseTo(BASE_FOV, 1);
    const calm = make(true); calm.setMode('follow');
    run(calm, 2, { probe: probe(), slow: true });
    expect(calm.cur.fov).toBe(BASE_FOV);
  });
  it('eases in rather than snapping', () => {
    const rig = make(); rig.setMode('follow');
    rig.update(1 / 60, { probe: probe(), slow: true });
    expect(rig.cur.fov - BASE_FOV).toBeLessThan(SLOW_FOV_KICK * 0.2);
  });
});

describe('shake', () => {
  it('moves the eye but not the look-at point, decays to nothing, and is off under reduced motion', () => {
    const rig = make(); rig.snap(0, 0);
    const still = rig.compute();
    rig.shake(1);
    rig.update(0.016);
    const shaken = rig.compute();
    expect(shaken.target).toEqual(still.target);
    expect(shaken.position).not.toEqual(still.position);
    run(rig, 2);
    expect(rig.shakeAmp).toBe(0);
    const calm = make(true); calm.shake(5);
    expect(calm.shakeAmp).toBe(0);
  });
  it('caps accumulated shake', () => {
    const rig = make(); for (let i = 0; i < 100; i++) rig.shake(1);
    expect(rig.shakeAmp).toBeLessThanOrEqual(1.5);
  });
});

describe('replay camera', () => {
  it('chases from behind and drifts slowly; no drift under reduced motion', () => {
    const rig = make(); rig.setMode('replay');
    const ctx = { probe: probe(5, 5, 4, 0) };
    run(rig, 1, ctx); const yaw1 = rig.goal.yaw;
    run(rig, 3, ctx); const yaw2 = rig.goal.yaw;
    expect(yaw2).not.toBeCloseTo(yaw1, 2);
    expect(Math.abs(yaw2 - yaw1)).toBeLessThan(0.5);
    expect(rig.goal.x).toBeCloseTo(5 + 4 * 0.25, 9); // looks slightly ahead of the probe
    const calm = make(true); calm.setMode('replay');
    run(calm, 1, ctx); const a = calm.goal.yaw; run(calm, 3, ctx);
    expect(calm.goal.yaw).toBe(a);
  });
});

describe('cycling modes', () => {
  it('cycles within the phase list and wraps', () => {
    const rig = make(); rig.setMode('follow');
    const seen = [];
    for (let i = 0; i < 5; i++) seen.push(rig.cycle('flying', 'kepi'));
    expect(seen).toEqual(['orbit', 'focus', 'overview', 'follow', 'orbit']);
    expect(rig.focusId).toBe('kepi');
    const plan = make();
    expect([plan.cycle('planning', 'kepi'), plan.cycle('planning', 'kepi')]).toEqual(['focus', 'plan']);
    expect(MODES_BY_PHASE.ended).toContain('plan');
  });
});
