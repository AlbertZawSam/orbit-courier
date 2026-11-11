import * as THREE from 'three';
import { createPost } from './post.js';
import { CameraRig } from './cameraRig.js';

export const COLORS = { void: 0x0a0e1f, ivory: 0xefe8d8, brass: 0xc8a35a, safe: 0x4fd1c5, danger: 0xf0623d, cargo: 0xf2c14e };

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.void);
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

/** Binds the pure CameraRig to the three.js camera. See cameraRig.js for the modes. */
export function createCamera(camera, { reducedMotion = () => false, onMode = null } = {}) {
  const rig = new CameraRig({ reducedMotion, onMode });
  return {
    rig,
    get dist() { return rig.cur.dist; },
    get mode() { return rig.mode; },
    setTarget: (x, z) => rig.setPlanTarget(x, z),
    snap: (x, z) => rig.snap(x, z),
    frame: (b, reset) => rig.frame(b, reset),
    zoom: (f) => rig.zoom(f),
    update(dt, ctx) {
      rig.update(dt, ctx);
      const c = rig.compute();
      camera.position.set(...c.position);
      camera.lookAt(c.target[0], c.target[1], c.target[2]);
      if (Math.abs(camera.fov - c.fov) > 0.01) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
    },
  };
}
