import * as THREE from 'three';
import { NOISE } from './glsl.js';

const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }';
const SKY_FRAG = /* glsl */ `
uniform float uTime; uniform int uMode; uniform float uDrift;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  vec3 base = vec3(0.0030, 0.0044, 0.0137), haze = vec3(0.0232, 0.0110, 0.0467);
  vec3 col = mix(base, haze, 0.10 + 0.12 * (d.y * 0.5 + 0.5));
  if (uMode >= 1) {
    vec3 p = d * 2.2 + vec3(uDrift, 0.0, uDrift * 0.6);
    float n1 = fbm(p, 5), n2 = fbm(p * 2.1 + 5.0, 4);
    float cloud = smoothstep(0.46, 0.82, n1) * (0.25 + 0.95 * n2);
    col += haze * cloud * 1.25;
    col += vec3(0.0, 0.012, 0.022) * smoothstep(0.55, 0.9, n2) * cloud;
    col += vec3(0.030, 0.012, 0.010) * smoothstep(0.7, 0.95, fbm(p * 1.3 + 20.0, 3)) * 0.8;
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const STAR_VERT = /* glsl */ `
attribute float aSize; attribute float aPhase; attribute vec3 aColor;
uniform float uTime; uniform float uTwinkle; uniform float uPixelRatio;
varying vec3 vColor; varying float vBright;
void main() {
  float tw = 1.0 - uTwinkle * 0.35 * (0.5 + 0.5 * sin(uTime * (1.5 + aPhase) + aPhase * 40.0));
  vColor = aColor; vBright = tw;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999;
  gl_PointSize = aSize * uPixelRatio;
}`;
const STAR_FRAG = /* glsl */ `
varying vec3 vColor; varying float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d); a *= a;
  gl_FragColor = vec4(vColor * vBright * a * 1.6, a);
}`;

/** Deterministic pseudo-random for a stable starfield. */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Nebula background sphere and twinkling starfield, both centered on the camera so they never parallax. */
export function createSky(scene, { reducedMotion = () => false } = {}) {
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uTime: { value: 0 }, uMode: { value: 1 }, uDrift: { value: 0 } },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 32), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  const N = 1800, r = rng(20260511);
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N), color = new Float32Array(N * 3);
  const tints = [[0.78, 0.86, 1.0], [1.0, 1.0, 1.0], [1.0, 0.92, 0.78], [1.0, 0.8, 0.6]];
  for (let i = 0; i < N; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(th) * 450, u * 450, s * Math.sin(th) * 450], i * 3);
    const m = Math.pow(r(), 3.2);
    size[i] = 1.2 + m * 3.2; phase[i] = r();
    const t = tints[Math.floor(r() * tints.length)], b = 0.35 + 0.65 * m + 0.2 * r();
    color.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uTwinkle: { value: 1 }, uPixelRatio: { value: 1 } },
  });
  const stars = new THREE.Points(geo, starMat);
  stars.frustumCulled = false; stars.renderOrder = -9;
  scene.add(stars);

  return {
    update(camera, now) {
      sky.position.copy(camera.position); stars.position.copy(camera.position);
      const still = reducedMotion();
      skyMat.uniforms.uTime.value = starMat.uniforms.uTime.value = still ? 0 : now;
      skyMat.uniforms.uDrift.value = still ? 0 : now * 0.004;
      starMat.uniforms.uTwinkle.value = still ? 0 : 1;
      starMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    },
    /** Nebula mode follows the quality tier: gradient on Low, layered clouds above. */
    setTier(tier) { skyMat.uniforms.uMode.value = tier.nebula === 'gradient' ? 0 : 1; },
    dispose() { scene.remove(sky, stars); skyMat.dispose(); starMat.dispose(); geo.dispose(); },
  };
}
