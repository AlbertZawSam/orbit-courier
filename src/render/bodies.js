import * as THREE from 'three';
import { createBodyMesh } from './planets.js';

/** Radial gradient corona drawn on a canvas (no image assets). */
function coronaTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0.0, 'rgba(255,240,200,1)'); grad.addColorStop(0.18, 'rgba(255,196,110,0.75)');
  grad.addColorStop(0.45, 'rgba(255,130,60,0.22)'); grad.addColorStop(1.0, 'rgba(255,90,40,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Procedural bodies (no textures) lit by the star, with a point light for the probe and a corona on the star.
 * `update(t)` places bodies and animates by sim time, so a paused planning phase is perfectly still.
 */
export function createBodies(scene, bodies, { reducedMotion = () => false } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const shared = { uSun: { value: new THREE.Vector3() }, uTime: { value: 0 } };
  const parts = {}, meshes = {};
  let corona = null, texture = null;
  for (const b of bodies) {
    const part = createBodyMesh(b, shared);
    group.add(part.group);
    parts[b.id] = part; meshes[b.id] = part.group;
    if (b.kind === 'star') {
      group.add(Object.assign(new THREE.PointLight(0xfff2d6, 4, 0, 0), { name: 'sunlight' }));
      texture = coronaTexture();
      corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      corona.scale.setScalar(b.radius * 6);
      group.add(corona);
    }
  }
  const star = bodies.find((b) => b.kind === 'star');
  return {
    meshes,
    update(t) {
      const still = reducedMotion();
      shared.uTime.value = still ? 0 : t;
      if (star) { const [sx, sz] = star.pos(t); shared.uSun.value.set(sx, 0, sz); group.getObjectByName('sunlight').position.set(sx, 0, sz); corona.position.set(sx, 0, sz); }
      for (const b of bodies) {
        const [x, z] = b.pos(t), part = parts[b.id];
        part.group.position.set(x, 0, z);
        part.spinner.rotation.y = still ? 0.4 : t * part.spin;
      }
    },
    setDetail(detail) { for (const p of Object.values(parts)) p.setDetail(detail); },
    dispose() {
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose(); });
      for (const p of Object.values(parts)) for (const m of p.mats) m.dispose();
      texture?.dispose(); corona?.material.dispose();
    },
  };
}
