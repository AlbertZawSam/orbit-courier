import * as THREE from 'three';
import { COLORS } from './scene.js';

const MAX_TRAIL = 4000;

/** Probe mesh, a fading-free trail line, and the aim arrow shown while planning. */
export function createProbeView(scene) {
  const probe = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: COLORS.cargo, emissive: 0x8a6a10, roughness: 0.4 }));
  probe.visible = false;
  scene.add(probe);

  const trailPos = new Float32Array(MAX_TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: COLORS.ivory, transparent: true, opacity: 0.7 }));
  trail.frustumCulled = false;
  scene.add(trail);
  let n = 0;

  const arrowGeo = new THREE.BufferGeometry();
  const arrow = new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: COLORS.brass }));
  arrow.frustumCulled = false;
  scene.add(arrow);

  return {
    mesh: probe,
    place(x, z) {
      probe.visible = true;
      probe.position.set(x, 0, z);
      probe.rotation.y += 0.05;
      if (n < MAX_TRAIL) {
        trailPos.set([x, 0, z], n * 3); n++;
        trailGeo.setDrawRange(0, n);
        trailGeo.attributes.position.needsUpdate = true;
      }
    },
    resetTrail() { n = 0; trailGeo.setDrawRange(0, 0); },
    hide() { probe.visible = false; },
    setAim(from, angle, length) {
      arrowGeo.setFromPoints([new THREE.Vector3(from.x, 0, from.z), new THREE.Vector3(from.x + Math.cos(angle) * length, 0, from.z + Math.sin(angle) * length)]);
      arrow.visible = true;
    },
    hideAim() { arrow.visible = false; },
  };
}
