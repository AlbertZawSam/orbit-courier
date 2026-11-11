export const SLOW_SCALE = 0.1;

/** Slow-motion planning with a per-level budget measured in real seconds. Sim DT never changes. */
export class SlowMo {
  constructor(budget) { this.budget = budget; this.left = budget; this.active = false; }
  toggle() {
    if (this.active) this.active = false;
    else if (this.left > 0) this.active = true;
    return this.active;
  }
  /** Spend budget for a real frame; returns the time scale to use for that frame. */
  tick(realDt) {
    if (!this.active) return 1;
    this.left = Math.max(0, this.left - realDt);
    if (this.left === 0) this.active = false;
    return SLOW_SCALE;
  }
  reset() { this.left = this.budget; this.active = false; }
}
