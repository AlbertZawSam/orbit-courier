// Game units: G = 1, so mu = mass. Planar simulation in (x, z).
export const G = 1;
export const DT = 1 / 120;       // fixed integration step (sim seconds)
export const EPS2 = 1e-4;        // gravity softening (squared length)
export const TAU = Math.PI * 2;
export const DEFAULT_PREVIEW_STEPS = 1800; // 15 sim-seconds
export const PAD_CLEARANCE = 1.05;         // launch starts at radius * this
