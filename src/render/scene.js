import * as THREE from 'three';
import { createPost } from './post.js';

export const COLORS = { void: 0x0a0e1f, ivory: 0xefe8d8, brass: 0xc8a35a, safe: 0x4fd1c5, danger: 0xf0623d, cargo: 0xf2c14e };

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.void);
  scene.add(new THREE.AmbientLight(0x6a5a8a, 0.55));
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

  const post = createPost(renderer, scene, camera);
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    post.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  return { renderer, scene, camera, post, render: () => post.render() };
}

/** Damped follow camera looking mostly down at the sim plane. */
export function createCamera(camera) {
  const target = new THREE.Vector3(), goal = new THREE.Vector3();
  let dist = 20, goalDist = 20;
  return {
    setTarget(x, z) { goal.set(x, 0, z); },
    snap(x, z) { goal.set(x, 0, z); target.copy(goal); },
    get dist() { return dist; },
    zoom(f) { goalDist = Math.min(90, Math.max(6, goalDist * f)); },
    update(dt) {
      const k = 1 - Math.exp(-dt * 4);
      target.lerp(goal, k);
      dist += (goalDist - dist) * k;
      camera.position.set(target.x, target.y + dist * 0.9, target.z + dist * 0.45);
      camera.lookAt(target);
    },
  };
}
