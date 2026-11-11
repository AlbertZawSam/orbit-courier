import * as THREE from 'three';
import './styles.css';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e1f);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(2.5, 2, 3.5);
camera.lookAt(0, 0, 0);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 1.4, 1.4),
  new THREE.MeshStandardMaterial({ color: 0xc8a35a, roughness: 0.5, metalness: 0.2 }),
);
scene.add(cube);
scene.add(new THREE.AmbientLight(0x2a1b3d, 1.2));
const sun = new THREE.DirectionalLight(0xfff2d6, 3);
sun.position.set(3, 4, 2);
scene.add(sun);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((ms) => {
  cube.rotation.y = ms * 0.0006;
  cube.rotation.x = ms * 0.0003;
  renderer.render(scene, camera);
});
