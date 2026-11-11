import * as THREE from 'three';
import { COLORS } from './scene.js';
import { handlePos } from '../game/plan.js';
import { nodeIndex } from '../sim/nodes.js';

/** Burn node markers on the path, plus prograde (brass) and radial (teal) handles on the selected node. */
export function createNodeView(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const markerGeo = new THREE.SphereGeometry(1, 16, 10);
  const mat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthTest: false });
  const lineMat = new THREE.LineBasicMaterial({ color: COLORS.ivory, depthTest: false });

  return {
    update(plan, pred, u) {
      group.clear();
      plan.nodes.forEach((node, i) => {
        const info = pred.nodeInfo.find((n) => n.idx === nodeIndex(node.t));
        if (!info) return;
        const sel = i === plan.selected;
        const m = new THREE.Mesh(markerGeo, mat(sel ? COLORS.cargo : COLORS.ivory, plan.locked(i) ? 0.35 : 1));
        m.scale.setScalar(0.22 * u); m.position.set(info.x, 0, info.z); m.renderOrder = 10;
        group.add(m);
        if (!sel || plan.locked(i)) return;
        [[0, COLORS.brass], [1, COLORS.safe]].forEach(([axis, color]) => {
          const [hx, hz] = handlePos(info, axis, node.dv[axis], u);
          const h = new THREE.Mesh(markerGeo, mat(color));
          h.scale.setScalar(0.28 * u); h.position.set(hx, 0, hz); h.renderOrder = 11;
          const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(info.x, 0, info.z), new THREE.Vector3(hx, 0, hz)]), lineMat);
          stem.renderOrder = 9;
          group.add(h, stem);
        });
      });
    },
  };
}
