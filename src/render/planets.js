import * as THREE from 'three';
import { NOISE } from './glsl.js';

const VERT = /* glsl */ `
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
void main() {
  vObj = position; vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const HEAD = /* glsl */ `
uniform vec3 uSun; uniform float uTime; uniform int uOct; uniform float uSeed;
uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
${NOISE}
float lightAmt(vec3 N, vec3 L) { return smoothstep(-0.06, 0.34, dot(N, L)); }
`;
const SUN = 'vec3 N = normalize(vN); vec3 L = normalize(uSun - vW); vec3 V = normalize(cameraPosition - vW); float lit = lightAmt(N, L);';
const FINISH = 'gl_FragColor = vec4(col, 1.0);';

const ROCKY = HEAD + /* glsl */ `
uniform float uOcean;
void main() {
  ${SUN}
  vec3 q = normalize(vObj), p = q * 2.2 + uSeed;
  float h = fbm(p, uOct);
  vec3 col; vec3 lights = vec3(0.0);
  if (uOcean > 0.5) {
    float sea = 0.5, land = smoothstep(sea, sea + 0.025, h);
    vec3 water = mix(vec3(0.03, 0.12, 0.30), vec3(0.10, 0.38, 0.55), smoothstep(sea - 0.2, sea, h));
    vec3 ground = mix(vec3(0.18, 0.40, 0.16), vec3(0.52, 0.42, 0.28), smoothstep(sea, sea + 0.24, h));
    float ice = smoothstep(0.80, 0.93, abs(q.y) + (h - 0.5) * 0.25);
    ground = mix(ground, vec3(0.74, 0.8, 0.88), ice); water = mix(water, vec3(0.7, 0.8, 0.9), ice * 0.85);
    col = toLinear(mix(water, ground, land));
    float city = smoothstep(0.58, 0.66, fbm(p * 9.0 + 7.0, 3)) * land * (1.0 - ice);
    lights = vec3(1.0, 0.70, 0.30) * city * 1.5;
  } else {
    col = mix(uColA, uColB, smoothstep(0.35, 0.65, h)); col = mix(col, uColC, smoothstep(0.65, 0.88, h)); col = toLinear(col);
  }
  col = col * (0.06 + 1.45 * lit) + lights * (1.0 - lit);
  ${FINISH}
}`;

const MOON = HEAD + /* glsl */ `
void main() {
  ${SUN}
  vec3 q = normalize(vObj), p = q * 1.6 + uSeed;
  float h = fbm(p * 2.0, uOct), c = craters(p, uOct);
  vec3 base = mix(uColA, uColB, h);
  vec3 col = toLinear(base * (1.0 + c * 0.35));
  col *= (0.05 + 1.7 * lit);
  ${FINISH}
}`;

const GAS = HEAD + /* glsl */ `
void main() {
  ${SUN}
  vec3 q = normalize(vObj); float lat = q.y;
  float warp = fbm(vec3(q.x * 2.0, lat * 7.0, q.z * 2.0 + uTime * 0.015) + uSeed, uOct);
  float b = sin(lat * 15.0 + warp * 3.6) * 0.5 + 0.5;
  b = mix(b, fbm(vec3(q.xz * 3.0, lat * 22.0) + uSeed, uOct), 0.35);
  vec3 c = mix(uColA, uColB, b);
  c = mix(c, uColC, smoothstep(0.62, 0.95, fbm(vec3(q.xz * 4.0, lat * 12.0 + 3.0) + uSeed, uOct)) * 0.7);
  float lon = atan(q.z, q.x) - uTime * 0.04 - 0.8, dl = mod(lon + 3.14159, 6.28318) - 3.14159;
  float storm = 1.0 - smoothstep(0.0, 1.0, length(vec2(dl * 2.2, (lat + 0.3) * 4.5)));
  c = mix(c, vec3(0.78, 0.30, 0.18), storm * 0.85);
  c *= 0.5 + 0.5 * pow(max(dot(N, V), 0.0), 0.55);
  vec3 col = toLinear(c) * (0.06 + 1.7 * lit);
  ${FINISH}
}`;

const ICE = HEAD + /* glsl */ `
void main() {
  ${SUN}
  vec3 q = normalize(vObj), p = q * 3.0 + uSeed;
  float h = fbm(p, uOct), ridge = 1.0 - abs(vnoise(p * 2.5) * 2.0 - 1.0);
  float cracks = smoothstep(0.93, 1.0, ridge) * 0.5 + smoothstep(0.96, 1.0, 1.0 - abs(vnoise(p * 5.0 + 9.0) * 2.0 - 1.0)) * 0.35;
  vec3 c = mix(uColA, uColB, h); c = mix(c, uColC, cracks);
  float sheen = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = toLinear(c) * (0.07 + 1.6 * lit) + toLinear(vec3(0.55, 0.8, 1.0)) * sheen * 0.35 * lit;
  ${FINISH}
}`;

const DARK = HEAD + /* glsl */ `
void main() {
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = toLinear(vec3(0.45, 0.25, 0.8)) * rim * 1.4 + vec3(0.0005);
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR = HEAD + /* glsl */ `
void main() {
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW), q = normalize(vObj);
  float g = fbm(q * 5.0 + vec3(uTime * 0.03), uOct), g2 = fbm(q * 14.0 - vec3(uTime * 0.05), 3);
  vec3 c = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.86, 0.45), g * 0.8 + g2 * 0.3);
  float mu = max(dot(N, V), 0.0);
  c *= 0.55 + 0.45 * pow(mu, 0.45);
  vec3 col = toLinear(c) * 1.45;
  ${FINISH}
}`;

const ATMOSPHERE = /* glsl */ `
uniform vec3 uSun; uniform vec3 uColA; uniform float uStrength;
varying vec3 vN; varying vec3 vW;
void main() {
  vec3 N = normalize(vN), L = normalize(uSun - vW), V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6), lit = smoothstep(-0.25, 0.55, dot(N, L));
  float a = rim * lit * uStrength;
  gl_FragColor = vec4(pow(uColA, vec3(2.2)) * a, a);
}`;

const RING = /* glsl */ `
uniform float uInner; uniform float uOuter; uniform vec3 uColA; uniform vec3 uColB; uniform float uSeed;
varying vec3 vObj;
${NOISE}
void main() {
  float r = length(vObj.xy), t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  float bands = 0.5 + 0.5 * sin(t * 46.0 + fbm(vec3(t * 9.0, uSeed, 0.0), 4) * 5.0);
  float fine = fbm(vec3(t * 90.0, uSeed + 4.0, 1.0), 3);
  float gap = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.92, t) * (1.0 - 0.9 * smoothstep(0.62, 0.64, t) * smoothstep(0.69, 0.67, t));
  float a = clamp((0.25 + 0.65 * bands) * (0.6 + 0.6 * fine) * gap, 0.0, 0.92);
  vec3 c = mix(uColA, uColB, bands * 0.6 + fine * 0.4);
  gl_FragColor = vec4(pow(c, vec3(2.2)) * 1.05, a);
}`;

/** Per-kind look: palette (authored in sRGB, converted in the shader), spin (rad per sim second). Unknown kinds fall back to the moon look. */
const C = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };
const LOOKS = {
  rocky:  { frag: ROCKY, a: C(0x5a4a3a), b: C(0x8a6d4e), c: C(0xc2a77f), spin: 0.12, atm: null },
  moon:   { frag: MOON,  a: C(0x4b4a4a), b: C(0xb8b0a2), c: C(0xffffff), spin: 0.05, atm: null },
  gas:    { frag: GAS,   a: C(0xb9895b), b: C(0xe7d2a8), c: C(0x8f4f35), spin: 0.2,  atm: [0xe9c999, 0.5] },
  ice:    { frag: ICE,   a: C(0xb9dcee), b: C(0xf1fbff), c: C(0x5d93b5), spin: 0.08, atm: [0xa8e6ff, 0.6] },
  station:{ frag: MOON,  a: C(0xb8b0a2), b: C(0xefe8d8), c: C(0xffffff), spin: 0.3,  atm: null },
  dark:   { frag: DARK,  a: C(0x000000), b: C(0x000000), c: C(0x000000), spin: 0,    atm: null },
};

export const OCTAVES = { lit: 2, fewer: 3, full: 5 };

/**
 * Build the meshes for one body: shader sphere, optional atmosphere shell, optional rings.
 * @returns {{group: THREE.Group, uniforms: object[], spinner: THREE.Object3D, setDetail: (d:string)=>void}}
 */
export function createBodyMesh(b, shared) {
  const group = new THREE.Group();
  const isStar = b.kind === 'star';
  const look = LOOKS[b.kind] ?? LOOKS.moon;
  const seed = [...b.id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 97;
  const uniforms = {
    uSun: shared.uSun, uTime: shared.uTime, uOct: { value: OCTAVES.full }, uSeed: { value: seed },
    uColA: { value: look.a }, uColB: { value: look.b }, uColC: { value: look.c }, uOcean: { value: b.style === 'earthlike' ? 1 : 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: isStar ? STAR : look.frag, uniforms });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 64, 40), mat);
  sphere.name = b.id;
  group.add(sphere);
  const mats = [mat];

  const atm = b.style === 'earthlike' ? [0x6fb6ff, 0.9] : look.atm;
  if (atm && !isStar) {
    const am = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: ATMOSPHERE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uSun: shared.uSun, uColA: { value: new THREE.Color(atm[0]) }, uStrength: { value: atm[1] } },
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(b.radius * 1.07, 48, 32), am);
    group.add(shell); mats.push(am);
  }
  if (b.rings) {
    const inner = b.radius * b.rings.inner, outer = b.radius * b.rings.outer;
    const rm = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vObj; void main(){ vObj = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: RING, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uInner: { value: inner }, uOuter: { value: outer }, uColA: { value: new THREE.Color(0xd9c3a0) }, uColB: { value: new THREE.Color(0x8b7a62) }, uSeed: { value: seed } },
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160, 1), rm);
    ring.rotation.x = -Math.PI / 2 + (b.rings.tilt ?? 0.3);
    group.add(ring); mats.push(rm);
  }
  return {
    group, spinner: sphere, mats,
    setDetail(detail) { uniforms.uOct.value = OCTAVES[detail] ?? OCTAVES.full; },
    spin: look.spin,
  };
}
