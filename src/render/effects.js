import * as THREE from 'three';
import { ParticlePool, thrustParticles, burstParticles, fade } from './particles.js';
import { COLORS } from './scene.js';

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vColor;
void main() {
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;
const FRAG = 'varying vec2 vUv; varying vec3 vColor; void main() { float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a; gl_FragColor = vec4(vColor * a, a); }';

const THRUST_RATE = 140;   // particles per second while a burn plume is active
const RING_LIFE = 1.1;

/**
 * Thruster plumes and crash / delivery bursts, driven by bus events. Instanced additive quads in a pool.
 * Photosensitivity: every particle only fades (see particles.js), bursts are soft sprays plus one slow
 * expanding ring, and no effect flashes the screen.
 */
export function createEffects(scene, bus, { max = 400, reducedMotion = () => false } = {}) {
  let pool = new ParticlePool(max);
  const mkMesh = (cap) => {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), cap);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.frustumCulled = false; m.renderOrder = 9; m.count = 0;
    scene.add(m); return m;
  };
  let mesh = mkMesh(max);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.cargo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.visible = false; ring.renderOrder = 9; scene.add(ring);

  let probe = null, thrust = null, ringState = null, carry = 0;
  const dummy = new THREE.Object3D();
  const scaleCount = (n) => Math.max(8, Math.round(n * (reducedMotion() ? 0.4 : 1)));

  bus.on('launch', (e) => { thrust = { left: 0.45, dir: [Math.cos(e.angle), Math.sin(e.angle)] }; });
  bus.on('node_burn', (e) => { thrust = { left: 0.35, dir: e.dir }; });
  bus.on('crash', (e) => {
    burstParticles('crash', { x: e.x, z: e.z }, scaleCount(70)).forEach((p) => pool.spawn(p));
    ringState = { age: 0, x: e.x, z: e.z, color: COLORS.danger };
  });
  bus.on('mission_complete', () => {
    if (!probe) return;
    burstParticles('delivery', probe, scaleCount(80)).forEach((p) => pool.spawn(p));
    ringState = { age: 0, x: probe.x, z: probe.z, color: COLORS.safe };
  });

  return {
    /** Per frame: `probe` is the live probe state (or null), `u` the screen-scaled unit, `dt` real seconds. */
    update(dt, u, p) {
      probe = p;
      if (thrust && p) {
        thrust.left -= dt;
        carry += THRUST_RATE * dt * (reducedMotion() ? 0.5 : 1);
        const k = Math.floor(carry); carry -= k;
        thrustParticles({ x: p.x, z: p.z, dir: thrust.dir }, k).forEach((q) => pool.spawn(q));
        if (thrust.left <= 0) thrust = null;
      }
      pool.update(dt);
      const s = Math.min(3, Math.max(1, u / 0.75));
      let n = 0;
      for (let i = 0; i < pool.max; i++) {
        if (!pool.alive[i]) continue;
        const a = fade(pool.age[i] / pool.life[i]), size = pool.size[i] * s;
        dummy.position.set(pool.x[i], 0, pool.z[i]); dummy.scale.setScalar(size * 2); dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.instanceColor.setXYZ(n, pool.color[i * 3] * a * 0.9, pool.color[i * 3 + 1] * a * 0.9, pool.color[i * 3 + 2] * a * 0.9);
        n++;
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      if (ringState) {
        ringState.age += dt;
        const g = ringState.age / RING_LIFE;
        if (g >= 1) { ringState = null; ring.visible = false; }
        else {
          ring.visible = true; ring.position.set(ringState.x, 0, ringState.z);
          ring.scale.setScalar(u * (0.3 + 3.2 * (1 - Math.pow(1 - g, 2))));
          ring.material.color.setHex(ringState.color); ring.material.opacity = 0.7 * fade(g);
        }
      }
    },
    /** Follow the quality tier's particle budget. */
    setMax(cap) {
      if (cap === pool.max) return;
      pool = pool.setMax(cap);
      scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = mkMesh(cap);
    },
    clear() { pool.clear(); thrust = null; ringState = null; ring.visible = false; mesh.count = 0; },
    get count() { return pool.count; },
  };
}
