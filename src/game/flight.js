import { DT } from '../sim/constants.js';
import { timeAt } from '../sim/gravity.js';
import { detectOutcome } from '../sim/outcome.js';
import { advanceProbe } from '../sim/advance.js';
import { indexNodes } from '../sim/nodes.js';
import { createMission } from '../sim/missions.js';

/**
 * Live flight. Pure (no three.js, no DOM): advances the probe with the same `advanceProbe`
 * that predict() uses, so a launch follows its preview exactly, burns included.
 */
export class Flight {
  constructor(sys, probe0, { t0 = 0, mission = null, bus = null, nodes = [] } = {}) {
    this.sys = sys; this.bus = bus; this.t0 = t0;
    this.probe = probe0; this.i = 0; this.acc = 0;
    this.outcome = null; this.fuelUsed = 0;
    this.nodeMap = indexNodes(nodes);
    this.mission = mission ? createMission(mission) : null;
    this.missionState = this.mission?.state() ?? null;
  }
  get t() { return timeAt(this.t0, this.i); }
  get elapsed() { return this.i * DT; }
  get done() { return this.outcome !== null; }

  /** Replace the node list. Burns at or before the current step have already happened and are ignored. */
  setNodes(nodes) { this.nodeMap = indexNodes(nodes); }

  /** Advance by real seconds times a time scale; returns how many fixed steps ran. */
  advance(realDt, timeScale = 1) {
    this.acc += realDt * timeScale;
    let n = 0;
    while (this.acc >= DT && !this.done && n < 2000) {
      this.acc -= DT; n++;
      const r = advanceProbe(this.probe, this.i, this.t0, this.sys, this.nodeMap);
      this.probe = r.p;
      for (const b of r.burns) { this.fuelUsed += b.cost; this.bus?.emit('node_burn', { t: this.t, dv: b.dv, cost: b.cost }); }
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
