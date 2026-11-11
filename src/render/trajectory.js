import * as THREE from 'three';
import { COLORS } from './scene.js';
import { fillRibbon, ribbonIndex, timeTicks, pickPins, findExtrema } from './ribbon.js';
import { dominantBody } from '../sim/probe.js';

const MAX_POINTS = 2100, MAX_TICKS = 64, MAX_PINS = 6;

const VERT = /* glsl */ `
attribute vec2 aNormal; attribute float aSide; attribute float aDist; attribute float aDanger;
uniform float uWidth; varying float vSide; varying float vDist; varying float vDanger;
void main() {
  vSide = aSide; vDist = aDist; vDanger = aDanger;
  vec3 p = position + vec3(aNormal.x, 0.0, aNormal.y) * aSide * uWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uSafe; uniform vec3 uDanger; uniform float uDash; uniform float uOffset;
varying float vSide; varying float vDist; varying float vDanger;
void main() {
  float edge = abs(vSide);
  float core = 1.0 - smoothstep(0.3, 0.6, edge), glow = (1.0 - smoothstep(0.0, 1.0, edge)) * 0.3;
  float hairline = 1.0 - 0.55 * (1.0 - smoothstep(0.0, 0.16, edge)); // engraved centre line
  float dash = step(0.5, fract((vDist + uOffset) / uDash));
  float on = mix(1.0, dash, vDanger);
  vec3 col = mix(uSafe, uDanger, vDanger);
  float a = (core * hairline + glow) * on;
  gl_FragColor = vec4(col * a * 1.25, a);
}`;

/**
 * Predicted path as an engraved ribbon: solid teal while safe, dashed orange after a crash, a tick every
 * sim-second, closest-approach pins with distance labels, and periapsis / apoapsis markers.
 */
export function createTrajectory(scene, { labels }) {
  const out = {
    pos: new Float32Array(MAX_POINTS * 2 * 3), normal: new Float32Array(MAX_POINTS * 2 * 2),
    side: new Float32Array(MAX_POINTS * 2), dist: new Float32Array(MAX_POINTS * 2), danger: new Float32Array(MAX_POINTS * 2),
  };
  const geo = new THREE.BufferGeometry();
  const attrs = {
    position: new THREE.BufferAttribute(out.pos, 3), aNormal: new THREE.BufferAttribute(out.normal, 2),
    aSide: new THREE.BufferAttribute(out.side, 1), aDist: new THREE.BufferAttribute(out.dist, 1), aDanger: new THREE.BufferAttribute(out.danger, 1),
  };
  for (const [k, a] of Object.entries(attrs)) { a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); }
  const fullIndex = ribbonIndex(MAX_POINTS);
  geo.setIndex(new THREE.BufferAttribute(fullIndex, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    // MAX blending: where quads overlap on a tight bend the brighter one wins instead of doubling up
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { uWidth: { value: 0.05 }, uSafe: { value: new THREE.Color(COLORS.safe) }, uDanger: { value: new THREE.Color(COLORS.danger) }, uDash: { value: 0.5 }, uOffset: { value: 0 } },
  });
  const ribbon = new THREE.Mesh(geo, mat);
  ribbon.frustumCulled = false; ribbon.renderOrder = 5;
  scene.add(ribbon);

  const tickPos = new Float32Array(MAX_TICKS * 6), tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPos, 3).setUsage(THREE.DynamicDrawUsage));
  tickGeo.setDrawRange(0, 0);
  const tickMat = new THREE.LineBasicMaterial({ color: COLORS.ivory, transparent: true, opacity: 0.8, depthTest: false });
  const tickLines = new THREE.LineSegments(tickGeo, tickMat);
  tickLines.frustumCulled = false; tickLines.renderOrder = 6;
  scene.add(tickLines);

  const pinPos = new Float32Array(MAX_PINS * 6), pinGeo = new THREE.BufferGeometry();
  pinGeo.setAttribute('position', new THREE.BufferAttribute(pinPos, 3).setUsage(THREE.DynamicDrawUsage));
  pinGeo.setDrawRange(0, 0);
  const leader = new THREE.LineSegments(pinGeo, new THREE.LineBasicMaterial({ color: COLORS.brass, transparent: true, opacity: 0.6, depthTest: false }));
  leader.frustumCulled = false; leader.renderOrder = 6;
  scene.add(leader);
  const ringGeo = new THREE.RingGeometry(0.7, 1, 24).rotateX(-Math.PI / 2);
  const pinMeshes = Array.from({ length: MAX_PINS + 2 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: COLORS.cargo, depthTest: false, transparent: true, opacity: 0.95 }));
    m.visible = false; m.renderOrder = 7; scene.add(m); return m;
  });
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.danger, depthTest: false }));
  marker.visible = false; marker.renderOrder = 8; scene.add(marker);
  const goalMark = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.safe, depthTest: false }));
  goalMark.visible = false; goalMark.renderOrder = 8; scene.add(goalMark);

  let state = { pins: [], crash: null, extrema: [], ticks: [] }, unit = 0.75, visible = true;

  function applyScale(u) {
    unit = u;
    mat.uniforms.uWidth.value = Math.max(0.03, u * 0.07);
    mat.uniforms.uDash.value = u * 0.7;
    const half = u * 0.22;
    state.ticks.forEach((t, k) => { tickPos.set([t.x - t.nx * half, 0, t.z - t.nz * half, t.x + t.nx * half, 0, t.z + t.nz * half], k * 6); });
    tickGeo.attributes.position.needsUpdate = true;
    pinMeshes.forEach((m) => m.scale.setScalar(u * 0.32));
    marker.scale.setScalar(u * 0.42); goalMark.scale.setScalar(u * 0.42);
  }

  return {
    /** Show a prediction. `sys` supplies the bodies used for pins and periapsis / apoapsis markers. */
    set(pred, sys) {
      const crashI = pred.crash ? pred.crash.i : pred.lost ? pred.lost.i : null;
      const n = Math.min(pred.points.length, MAX_POINTS);
      fillRibbon(pred.points.slice(0, n), crashI, out);
      for (const a of Object.values(attrs)) a.needsUpdate = true;
      geo.setDrawRange(0, Math.max(0, (n - 1) * 6));

      state.ticks = timeTicks(pred.points).slice(0, MAX_TICKS);
      tickGeo.setDrawRange(0, state.ticks.length * 2);

      labels.removePrefix('pin:'); labels.removePrefix('ext:');
      const pins = pickPins(pred, sys).slice(0, MAX_PINS);
      state.pins = pins;
      pins.forEach((p, k) => {
        pinPos.set([p.x, 0, p.z, p.bx, 0, p.bz], k * 6);
        pinMeshes[k].position.set(p.x, 0, p.z); pinMeshes[k].visible = visible;
        labels.set(`pin:${k}`, p.x, p.z, `${p.name} ${p.dist.toFixed(1)}`, 'pin');
      });
      for (let k = pins.length; k < MAX_PINS; k++) pinMeshes[k].visible = false;
      pinGeo.attributes.position.needsUpdate = true; pinGeo.setDrawRange(0, pins.length * 2);

      state.extrema = [];
      const last = pred.points[pred.points.length - 1];
      const dom = pred.orbit && !pred.orbit.escape ? sys.byId[pred.orbit.bodyId] : dominantBody(last.x, last.z, last.t, sys.bodies);
      if (dom && pred.orbit && !pred.orbit.escape) {
        const e = findExtrema(pred.points, dom);
        [['peri', 'Pe', e.peri], ['apo', 'Ap', e.apo]].forEach(([key, tag, pt], k) => {
          if (!pt || pt.d > 12) return;
          if (pins.some((p) => Math.hypot(p.x - pt.x, p.z - pt.z) < unit * 1.2)) return; // the pin already marks this spot
          const m = pinMeshes[MAX_PINS + k];
          m.position.set(pt.x, 0, pt.z); m.material.color.setHex(COLORS.ivory); m.visible = visible; state.extrema.push(m);
          labels.set(`ext:${key}`, pt.x, pt.z, `${tag} ${pt.d.toFixed(1)}`, 'ext');
        });
      }
      for (let k = 0; k < 2; k++) if (!state.extrema.includes(pinMeshes[MAX_PINS + k])) pinMeshes[MAX_PINS + k].visible = false;

      state.crash = pred.crash; state.delivered = pred.delivered;
      marker.visible = visible && !!pred.crash;
      if (pred.crash) marker.position.set(pred.crash.x, 0, pred.crash.z);
      goalMark.visible = visible && !!pred.delivered;
      labels.remove('goal');
      if (pred.delivered) { goalMark.position.set(pred.delivered.x, 0, pred.delivered.z); labels.set('goal', pred.delivered.x, pred.delivered.z, `Delivered ${(pred.delivered.t - pred.points[0].t + pred.points[0].i / 120).toFixed(1)} s`, 'goal'); }
      applyScale(unit);
    },
    /** Keep line widths constant on screen as the camera zooms. */
    setScale(u) { if (Math.abs(u - unit) / unit > 0.01) applyScale(u); },
    clear() { geo.setDrawRange(0, 0); tickGeo.setDrawRange(0, 0); pinGeo.setDrawRange(0, 0); pinMeshes.forEach((m) => { m.visible = false; }); marker.visible = false; goalMark.visible = false; labels.remove('goal'); labels.removePrefix('pin:'); labels.removePrefix('ext:'); },
    setVisible(v) {
      visible = v; ribbon.visible = v; tickLines.visible = v; leader.visible = v; marker.visible = v && !!state.crash; goalMark.visible = v && !!state.delivered;
      pinMeshes.forEach((m, k) => { m.visible = v && (k < state.pins.length || state.extrema.includes(m)); });
      if (!v) { labels.removePrefix('pin:'); labels.removePrefix('ext:'); labels.remove('goal'); }
    },
  };
}
