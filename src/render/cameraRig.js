// Pure camera logic (no three.js): modes, damping, limits, FOV kick and shake. Testable without a GPU.

export const PLAN_PITCH = Math.atan2(0.9, 0.45);   // the planning view's elevation from the horizontal
export const DIST_MUL = Math.hypot(0.9, 0.45);     // eye distance per unit of `dist`
export const YAW0 = Math.PI / 2;                   // camera sits on the +z side looking toward -z
export const BASE_FOV = 45, SLOW_FOV_KICK = 7;
export const CINEMATIC_SECONDS = 3;
export const ORBIT_YAW_LIMIT = 1.2, PITCH_MIN = 0.35, PITCH_MAX = 1.45;
export const DIST_MIN = 6, DIST_MAX = 90;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

/** Modes available in each game phase, in the order the C key cycles them. */
export const MODES_BY_PHASE = {
  planning: ['plan', 'focus'],
  flying: ['follow', 'orbit', 'focus', 'overview'],
  ended: ['plan', 'focus'],
};

/**
 * Damped camera with these modes:
 *   plan      fit view used while aiming          follow    chase the probe
 *   orbit     follow with limited yaw and pitch   focus     look at one body
 *   overview  wide shot of the whole encounter    cinematic 3 s launch move that ends in follow
 *   replay    slow chase used by the result Replay
 * Reduced motion removes the cinematic, the replay drift, the slow-motion FOV kick, and shake.
 */
export class CameraRig {
  constructor({ reducedMotion = () => false, onMode = null } = {}) {
    this.reducedMotion = reducedMotion; this.onMode = onMode;
    this.mode = 'plan'; this.t = 0; this.clock = 0;
    this.cur = { x: 0, z: 0, dist: 15, yaw: YAW0, pitch: PLAN_PITCH, fov: BASE_FOV };
    this.goal = { ...this.cur };
    this.userDist = 15;
    this.planTarget = { x: 0, z: 0 };
    this.orbit = { yaw: 0, pitch: 0 };
    this.focusId = null;
    this.shakeAmp = 0;
  }

  setMode(mode, { focusId = this.focusId } = {}) {
    if (mode === 'cinematic' && this.reducedMotion()) mode = 'follow'; // no camera flourish under reduced motion
    this.focusId = focusId;
    if (mode !== 'orbit') this.orbit = { yaw: 0, pitch: 0 };
    if (this.mode !== mode) { this.mode = mode; this.t = 0; this.onMode?.(mode); }
  }

  /** Next mode for this phase (the C key). */
  cycle(phase, focusId = this.focusId) {
    const list = MODES_BY_PHASE[phase] ?? MODES_BY_PHASE.planning;
    const i = list.indexOf(this.mode);
    this.setMode(list[(i + 1) % list.length], { focusId });
    return this.mode;
  }

  setPlanTarget(x, z) { this.planTarget = { x, z }; }
  snap(x, z) { this.planTarget = { x, z }; Object.assign(this.cur, { x, z }); Object.assign(this.goal, { x, z }); }
  zoom(f) { this.userDist = clamp(this.userDist * f, DIST_MIN, DIST_MAX); }
  /** Rotate within limits (screen pixels). Switches a following camera to orbit. */
  orbitBy(dx, dy) {
    if (this.mode === 'follow') this.setMode('orbit');
    if (this.mode !== 'orbit') return;
    this.orbit.yaw = clamp(this.orbit.yaw - dx * 0.006, -ORBIT_YAW_LIMIT, ORBIT_YAW_LIMIT);
    this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.005, PITCH_MIN - PLAN_PITCH, PITCH_MAX - PLAN_PITCH);
  }
  shake(amount) { if (!this.reducedMotion()) this.shakeAmp = Math.min(1.5, this.shakeAmp + amount); }

  /**
   * Fit a world rectangle in view. On `reset` the fit is exact; otherwise the view only ever zooms out,
   * so aiming never makes the picture jump around.
   */
  frame(b, reset = false) {
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const need = Math.max((b.maxX - b.minX) / (1.65 * 0.62), (b.maxZ - b.minZ) / (0.926 * 0.62), 9);
    this.planTarget = { x: cx, z: cz };
    this.userDist = reset ? Math.min(DIST_MAX, need) : Math.min(DIST_MAX, Math.max(this.userDist, need));
  }

  /**
   * @param {number} dt real seconds
   * @param {{probe?:{x:number,z:number,vx:number,vz:number}|null, focus?:(id:string)=>({x:number,z:number,radius:number}|null), slow?:boolean}} ctx
   */
  update(dt, ctx = {}) {
    this.clock += dt; this.t += dt;
    const g = this.goal, probe = ctx.probe ?? null, red = this.reducedMotion();
    g.yaw = YAW0; g.pitch = PLAN_PITCH; g.dist = this.userDist;
    switch (this.mode) {
      case 'plan': g.x = this.planTarget.x; g.z = this.planTarget.z; break;
      case 'follow': if (probe) { g.x = probe.x; g.z = probe.z; } break;
      case 'orbit':
        if (probe) { g.x = probe.x; g.z = probe.z; }
        g.yaw = YAW0 + this.orbit.yaw; g.pitch = clamp(PLAN_PITCH + this.orbit.pitch, PITCH_MIN, PITCH_MAX);
        break;
      case 'focus': {
        const f = ctx.focus?.(this.focusId);
        if (f) { g.x = f.x; g.z = f.z; g.dist = clamp(f.radius * 7, 5, this.userDist); }
        break;
      }
      case 'overview': g.x = this.planTarget.x; g.z = this.planTarget.z; g.dist = Math.min(DIST_MAX, this.userDist * 1.8); g.pitch = PLAN_PITCH + 0.2; break;
      case 'cinematic': {
        if (probe) { g.x = probe.x; g.z = probe.z; }
        const e = ease(this.t / CINEMATIC_SECONDS);
        g.yaw = YAW0 - 0.9 * (1 - e); g.pitch = lerp(0.62, PLAN_PITCH, e); g.dist = lerp(6, this.userDist, e);
        if (this.t >= CINEMATIC_SECONDS) this.setMode('follow');
        break;
      }
      case 'replay':
        if (probe) { g.x = probe.x + probe.vx * 0.25; g.z = probe.z + probe.vz * 0.25; }
        g.yaw = YAW0 - (red ? 0 : 0.6 - 0.12 * this.t); g.pitch = 0.78; g.dist = clamp(this.userDist * 0.55, 7, 14);
        break;
      default: break;
    }
    g.fov = BASE_FOV + (ctx.slow && !red ? SLOW_FOV_KICK : 0);

    const k = (rate) => 1 - Math.exp(-dt * rate), c = this.cur;
    c.x += (g.x - c.x) * k(5); c.z += (g.z - c.z) * k(5);
    c.dist += (g.dist - c.dist) * k(4); c.yaw += (g.yaw - c.yaw) * k(4); c.pitch += (g.pitch - c.pitch) * k(4);
    c.fov += (g.fov - c.fov) * k(6);
    this.shakeAmp *= Math.exp(-dt * 9); if (this.shakeAmp < 1e-4) this.shakeAmp = 0;
  }

  /** Eye position, look-at point and field of view for the current state. */
  compute() {
    const c = this.cur, d = c.dist * DIST_MUL, ch = Math.cos(c.pitch);
    const sx = this.shakeAmp * c.dist * 0.02 * Math.sin(this.clock * 47), sz = this.shakeAmp * c.dist * 0.02 * Math.cos(this.clock * 53);
    return {
      position: [c.x + d * ch * Math.cos(c.yaw) + sx, d * Math.sin(c.pitch), c.z + d * ch * Math.sin(c.yaw) + sz],
      target: [c.x, 0, c.z],
      fov: c.fov,
    };
  }
}
