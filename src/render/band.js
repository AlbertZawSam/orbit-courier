import * as THREE from 'three';
import { COLORS } from './scene.js';

const VERT = 'varying vec3 vObj; void main() { vObj = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = /* glsl */ `
uniform float uMin; uniform float uMax; uniform float uTime; uniform float uProgress; uniform vec3 uColor;
varying vec3 vObj;
void main() {
  float r = length(vObj.xy), ang = atan(vObj.y, vObj.x);
  float pulse = 0.5 + 0.5 * sin(uTime * 2.0);
  float edge = (1.0 - smoothstep(0.0, 0.05, abs(r - uMin))) + (1.0 - smoothstep(0.0, 0.05, abs(r - uMax)));
  float dashes = step(0.45, fract(ang * 14.0 / 6.28318 + uTime * 0.0)); // dashed edges: a cue that does not rely on colour
  float fill = 0.08 + 0.05 * pulse + 0.1 * uProgress;
  float a = fill + edge * (0.35 + 0.3 * dashes);
  gl_FragColor = vec4(uColor * a, a);
}`;

/** The target orbit band: a softly pulsing annulus with dashed edges around the mission target. */
export function createTargetBand(scene, mission, { reducedMotion = () => false } = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uMin: { value: mission.rMin }, uMax: { value: mission.rMax }, uTime: { value: 0 }, uProgress: { value: 0 }, uColor: { value: new THREE.Color(COLORS.cargo) } },
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(mission.rMin * 0.9, mission.rMax * 1.1, 128, 1), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2;
  scene.add(mesh);
  return {
    update(x, z, now, progress = 0) {
      mesh.position.set(x, 0, z);
      mat.uniforms.uTime.value = reducedMotion() ? 0 : now;
      mat.uniforms.uProgress.value = progress;
    },
    dispose() { scene.remove(mesh); mesh.geometry.dispose(); mat.dispose(); },
  };
}
