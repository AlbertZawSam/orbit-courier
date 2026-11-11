import * as THREE from 'three';
import { COLORS } from './scene.js';
import { speedColor } from './ribbon.js';

const MAX_TRAIL = 4000;

/**
 * Faceted probe with navigation lights (red port, green starboard, a slow white strobe), a trail coloured
 * by speed, and the aim arrow shown while planning. The strobe is 1 Hz, and steady under reduced motion.
 */
export function createProbeView(scene, { reducedMotion = () => false } = {}) {
  const probe = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 4).rotateZ(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.cargo, emissive: 0x6a4a08, roughness: 0.35, metalness: 0.3, flatShading: true }));
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.62), new THREE.MeshStandardMaterial({ color: 0xefe8d8, roughness: 0.5, flatShading: true }));
  wing.position.x = -0.12;
  const light = (color, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color })); m.position.set(-0.12, 0.02, z); return m; };
  const port = light(0xff3b2f, -0.31), starboard = light(0x2fff6a, 0.31);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobe.position.set(-0.26, 0.04, 0);
  probe.add(hull, wing, port, starboard, strobe);
  probe.visible = false;
  scene.add(probe);

  const trailPos = new Float32Array(MAX_TRAIL * 3), trailCol = new Float32Array(MAX_TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  trail.frustumCulled = false;
  scene.add(trail);
  let n = 0;

  const arrowGeo = new THREE.BufferGeometry();
  const arrow = new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: COLORS.brass }));
  arrow.frustumCulled = false;
  scene.add(arrow);

  return {
    mesh: probe,
    /** Place the probe, point it along its velocity, and extend the trail. `speed` is relative to the dominant body. */
    place(x, z, vx, vz, speed, now = 0) {
      probe.visible = true;
      probe.position.set(x, 0, z);
      if (Math.hypot(vx, vz) > 1e-9) probe.rotation.y = -Math.atan2(vz, vx);
      const blink = reducedMotion() ? 0.6 : (Math.sin(now * Math.PI * 2) > 0.85 ? 1 : 0.12);
      strobe.material.color.setScalar(blink);
      if (n < MAX_TRAIL) {
        trailPos.set([x, 0, z], n * 3);
        const c = speedColor(speed / 8);
        trailCol.set([c[0], c[1], c[2]], n * 3);
        n++;
        trailGeo.setDrawRange(0, n);
        trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
      }
    },
    setScale(u) { probe.scale.setScalar(Math.min(3, Math.max(1, u / 0.75))); },
    resetTrail() { n = 0; trailGeo.setDrawRange(0, 0); },
    hide() { probe.visible = false; },
    setAim(from, angle, length) {
      arrowGeo.setFromPoints([new THREE.Vector3(from.x, 0, from.z), new THREE.Vector3(from.x + Math.cos(angle) * length, 0, from.z + Math.sin(angle) * length)]);
      arrow.visible = true;
    },
    hideAim() { arrow.visible = false; },
  };
}
