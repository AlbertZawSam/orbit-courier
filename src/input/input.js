import * as THREE from 'three';

export const AIM_RANGE = 6; // world units of drag that map to full power

/**
 * Drag to aim: angle from the pad body to the pointer, power from the drag distance.
 * Keyboard fallback: arrows turn and change power, Enter or Space launches.
 */
export function createInput({ canvas, camera, getPad, getAim, setAim, canAim, onLaunch, onZoom, onReset }) {
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let dragging = false;

  const worldPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    return ray.ray.intersectPlane(plane, hit);
  };
  const aimFrom = (e) => {
    const p = worldPoint(e), pad = getPad();
    if (!p) return;
    const dx = p.x - pad.x, dz = p.z - pad.z;
    setAim({ angle: Math.atan2(dz, dx), power: Math.min(1, Math.hypot(dx, dz) / AIM_RANGE) });
  };

  canvas.addEventListener('pointerdown', (e) => { if (!canAim()) return; dragging = true; canvas.setPointerCapture(e.pointerId); aimFrom(e); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) aimFrom(e); });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); onZoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const a = getAim();
    if (e.key === 'r' || e.key === 'R') return onReset();
    if (!canAim()) return;
    if (e.key === 'ArrowLeft') setAim({ ...a, angle: a.angle - (e.shiftKey ? 0.01 : 0.05) });
    else if (e.key === 'ArrowRight') setAim({ ...a, angle: a.angle + (e.shiftKey ? 0.01 : 0.05) });
    else if (e.key === 'ArrowUp') setAim({ ...a, power: Math.min(1, a.power + 0.02) });
    else if (e.key === 'ArrowDown') setAim({ ...a, power: Math.max(0, a.power - 0.02) });
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLaunch(); }
    else return;
    e.preventDefault();
  });
}
