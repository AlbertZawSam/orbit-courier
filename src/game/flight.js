import { DT } from '../sim/constants.js';
import { step, timeAt } from '../sim/gravity.js';
import { detectOutcome } from '../sim/outcome.js';
import { createMission } from '../sim/missions.js';

/**
 * Live flight. Pure (no three.js, no DOM): advances the probe with the same `step` and
 * `timeAt` that predict() uses, so a launch follows its preview exactly.
 */
export class Flight {
  constructor(sys, probe0, { t0 = 0, mission = null, bus = null } = {}) {
    this.sys = sys; this.bus = bus; this.t0 = t0;
    this.probe = probe0; this.i = 0; this.acc = 0;
    this.outcome = null;
    this.mission = mission ? createMission(mission) : null;
    this.missionState = this.mission?.state() ?? null;
  }
  get t() { return timeAt(this.t0, this.i); }
  get done() { return this.outcome !== null; }

  /** Advance by real seconds times a time scale; returns how many fixed steps ran. */
  advance(realDt, timeScale = 1) {
    this.acc += realDt * timeScale;
    let n = 0;
    while (this.acc >= DT && !this.done && n < 2000) {
      this.acc -= DT; n++;
      this.probe = step(this.probe, timeAt(this.t0, this.i), this.sys.bodies, this.sys.hazards ?? []);
      this.i++;
      const t = this.t;
      const out = detectOutcome(this.probe, t, this.sys.bodies, this.sys.bounds ?? Infinity);
      if (out) { this.outcome = { ...out, t }; this.bus?.emit(out.type, this.outcome); break; }
      if (this.mission) {
        const was = this.missionState?.done;
        this.missionState = this.mission.update(this.probe, t, this.sys.byId);
        if (this.missionState.done && !was) {
          this.outcome = { type: 'delivered', t };
          this.bus?.emit('mission_complete', this.outcome);
        }
      }
    }
    return n;
  }
}
