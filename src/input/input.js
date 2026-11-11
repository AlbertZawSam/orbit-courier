import * as THREE from 'three';

/**
 * Turns pointer, wheel and key events into world-plane points and delegates meaning to `controls`.
 * `controls.onDown(pt)` returns a drag callback (or null); `controls.onKey(e)` returns true if handled.
 */
export function createInput({ canvas, camera, controls, onZoom }) {
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let drag = null;
  const worldPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const p = ray.ray.intersectPlane(plane, hit);
    return p ? [p.x, p.z] : null;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const pt = worldPoint(e);
    if (!pt) return;
    drag = controls.onDown(pt, [e.clientX, e.clientY]);
    if (drag) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => { if (drag) { const pt = worldPoint(e); if (pt) drag(pt, [e.clientX, e.clientY]); } });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); onZoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target.closest?.('#card, #coach, #settings') || e.metaKey || e.ctrlKey) return;
    if (controls.onKey(e)) e.preventDefault();
  });
}
