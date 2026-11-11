import * as THREE from 'three';
import { COLORS } from './scene.js';
import { createTargetBand } from './band.js';
import { gateEnds } from '../sim/geometry.js';

/** Gates: a bar between two posts. Passed gates turn teal, the next one is gold and pulses, the rest are dim ivory. */
function createGates(scene, mission, reducedMotion) {
  const group = new THREE.Group();
  scene.add(group);
  const parts = mission.gates.map((g) => {
    const [a, b] = gateEnds(g), len = Math.hypot(b.x - a.x, b.z - a.z);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.07).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.ivory, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    bar.position.set(g.x, 0, g.z); bar.rotation.y = -g.angle; bar.renderOrder = 4;
    const post = (p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.ivory })); m.position.set(p.x, 0, p.z); return m; };
    const ps = [post(a), post(b)];
    group.add(bar, ...ps);
    return { bar, ps };
  });
  return {
    update(state, now) {
      const passed = state?.passed ?? 0, pulse = reducedMotion() ? 1 : 0.65 + 0.35 * Math.sin(now * 3);
      parts.forEach(({ bar, ps }, i) => {
        const color = i < passed ? COLORS.safe : i === passed ? COLORS.cargo : COLORS.ivory;
        bar.material.color.setHex(color); bar.material.opacity = i === passed ? 0.55 + 0.4 * pulse : i < passed ? 0.9 : 0.45;
        ps.forEach((p) => p.material.color.setHex(color));
      });
    },
    dispose() { scene.remove(group); group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); },
  };
}

/** Asteroids as small grey rocks, positioned each frame from their rails. */
function createAsteroidView(scene, field) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xbdb4a6, emissive: 0x2a251f, roughness: 1, flatShading: true }), field.rocks.length);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const o = new THREE.Object3D();
  return {
    update(t) {
      const pos = field.positionsAt(t);
      field.rocks.forEach((rock, i) => { o.position.set(pos[i][0], 0, pos[i][1]); o.scale.setScalar(rock.size); o.rotation.set(i, i * 1.7, 0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); },
  };
}

/** Solar wind: a dashed rim and a few chevrons that point the way the push is going right now. */
function createWindView(scene, wind, reducedMotion) {
  const group = new THREE.Group();
  scene.add(group);
  const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, k) => new THREE.Vector3(Math.cos((k / 96) * Math.PI * 2) * wind.radius, 0, Math.sin((k / 96) * Math.PI * 2) * wind.radius))), new THREE.LineDashedMaterial({ color: COLORS.cargo, dashSize: 0.5, gapSize: 0.4, transparent: true, opacity: 0.55 }));
  rim.computeLineDistances();
  group.add(rim);
  const arrows = [];
  const n = Math.max(3, Math.min(9, Math.round(wind.radius / 2)));
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 3).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.cargo, transparent: true, opacity: 0.55 }));
    const a = (k / n) * Math.PI * 2, r = k % 2 ? wind.radius * 0.35 : wind.radius * 0.65;
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); group.add(m); arrows.push(m);
  }
  return {
    update(t, now) {
      const [cx, cz] = wind.centreAt(t), ang = wind.angleAt(t);
      group.position.set(cx, 0, cz);
      arrows.forEach((m, k) => { m.rotation.y = -ang; m.material.opacity = reducedMotion() ? 0.55 : 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(now * 2 + k)); });
    },
    dispose() { scene.remove(group); group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); },
  };
}

/** A dark mass is almost invisible by itself, so mark it with a slow violet halo and a thin warning ring. */
function createDarkView(scene, body, reducedMotion) {
  const group = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.RingGeometry(body.radius * 1.4, body.radius * 7, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7a3fd0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(body.radius * 3.2, body.radius * 3.5, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.danger, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  group.add(halo, ring); scene.add(group);
  return {
    update(t, now) {
      const [x, z] = body.pos(t);
      group.position.set(x, 0, z);
      halo.material.opacity = reducedMotion() ? 0.22 : 0.18 + 0.08 * Math.sin(now * 1.5);
    },
    dispose() { scene.remove(group); group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); },
  };
}

/** What a mission's target looks like: a pulsing orbit band, a capture disc, or a ring around the landing body. */
function bandFor(mission, sys) {
  const body = sys.byId[mission.target];
  if (mission.type === 'deliver_orbit') return { rMin: mission.rMin, rMax: mission.rMax };
  if (mission.type === 'rendezvous') return { rMin: 0.02, rMax: mission.captureDist };
  if (mission.type === 'soft_landing') return { rMin: body.radius * 1.02, rMax: body.radius * 1.7 };
  return null;
}

/** Everything a level adds to the scene beyond the bodies: the mission marker and the hazards. */
export function createLevelView(scene, level, sys, { reducedMotion = () => false } = {}) {
  const band = bandFor(level.mission, sys);
  const bandView = band ? createTargetBand(scene, band, { reducedMotion }) : null;
  const gates = level.mission.type === 'gate_run' ? createGates(scene, level.mission, reducedMotion) : null;
  const hazards = sys.hazards.map((h) => (h.type === 'asteroids' ? createAsteroidView(scene, h) : h.type === 'solar_wind' ? createWindView(scene, h, reducedMotion) : null)).filter(Boolean);
  const darks = sys.bodies.filter((b) => b.kind === 'dark').map((b) => createDarkView(scene, b, reducedMotion));
  hazards.push(...darks);
  const target = sys.byId[level.mission.target];
  return {
    /** `t` sim time, `now` wall seconds, `state` the live mission state (or null). */
    update(t, now, state) {
      if (bandView) { const [x, z] = target.pos(t); bandView.update(x, z, now, state?.progress ?? 0); }
      gates?.update(state, now);
      hazards.forEach((h) => h.update(t, now));
    },
    dispose() { bandView?.dispose(); gates?.dispose(); hazards.forEach((h) => h.dispose()); },
  };
}
