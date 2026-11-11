import * as THREE from 'three';
import { COLORS } from './scene.js';

/** Predicted path as a line: teal when safe, orange when the preview ends in a crash. */
export function createTrajectory(scene) {
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.LineBasicMaterial({ color: COLORS.safe });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.danger }));
  marker.visible = false;
  scene.add(marker);
  return {
    set(pred) {
      const pts = pred.points.map((p) => new THREE.Vector3(p.x, 0, p.z));
      geo.setFromPoints(pts);
      mat.color.setHex(pred.crash || pred.lost ? COLORS.danger : COLORS.safe);
      marker.visible = !!pred.crash;
      if (pred.crash) marker.position.set(pred.crash.x, 0, pred.crash.z);
    },
    clear() { geo.setFromPoints([]); marker.visible = false; },
    setVisible(v) { line.visible = v; if (!v) marker.visible = false; },
  };
}
