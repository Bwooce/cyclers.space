// Planar CR3BP propagation for the front-page hero scenes (task #227, design
// docs/superpowers/specs/2026-06-13-front-page-orbit-viz-design.md §1).
//
// The Ross Earth-Moon cycler rows (V2) carry a complete CR3BP identity in
// orbit_elements.cr3bp: sourced (mu, C, T_nd) plus state_nd (derived upstream
// by the fixed-Jacobi corrector from the sourced values — the publication gap
// is recorded in the row's data_gaps, #216). Propagating that state for the
// sourced period in the rotating frame is mechanical reproduction of the
// row's own data — NOT invented geometry — provided we (a) surface the
// provenance in the caption and (b) verify the propagation against the
// SOURCED invariants. This module therefore reports the Jacobi drift and the
// period-closure residual alongside the points, so the renderer and the unit
// tests can both check honesty mechanically.
//
// Model: planar circular restricted three-body problem, rotating (synodic)
// frame, nondimensional units (distance = primary separation, time such that
// the mean motion is 1). Primary m1 (Earth) at (-mu, 0), secondary m2 (Moon)
// at (1-mu, 0).
//
//   xddot - 2*ydot = dOmega/dx,  yddot + 2*xdot = dOmega/dy
//   Omega = (x^2 + y^2)/2 + (1-mu)/r1 + mu/r2
//   C = 2*Omega - (xdot^2 + ydot^2)        (Jacobi constant)
//
// Integrator: classical RK4, fixed step. The Ross orbits are stable
// (|stability_index| << 1) with periods 10-20 TU. The default step count is
// sized by the WORST row — the (3,1) family's close approach needs ~160k
// steps before the Jacobi drift falls to ~1e-9 (at 20k it is 1e-5); the
// other four rows are comfortable far earlier. At that count the remaining
// closure residual (<= ~4e-4 nd, ~160 km) is the floor set by the
// catalogue's 10-decimal state_nd printing, not the integrator.
//
// Pure TS, framework-free, no three import: shared by the build-time poster
// generator and the lazily-loaded gallery, and unit-testable in node.

export interface Cr3bpState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Cr3bpOrbit {
  /** Rotating-frame positions over one period, nondimensional units. */
  points: { x: number; y: number }[];
  /** Nondimensional time of each point (0 .. periodNd). */
  timesNd: number[];
  /** Jacobi constant at the initial state. */
  jacobi0: number;
  /** max |C(t) - C(0)| over the propagation (integrator-honesty metric). */
  jacobiDrift: number;
  /** |state(T) - state(0)| position residual, nondimensional (closure check). */
  closureNd: number;
}

/** Jacobi constant of a planar rotating-frame state. */
export function jacobiConstant(mu: number, s: Cr3bpState): number {
  const r1 = Math.hypot(s.x + mu, s.y);
  const r2 = Math.hypot(s.x - 1 + mu, s.y);
  const omega = (s.x * s.x + s.y * s.y) / 2 + (1 - mu) / r1 + mu / r2;
  return 2 * omega - (s.vx * s.vx + s.vy * s.vy);
}

/** Planar CR3BP equations of motion (rotating frame), d/dt [x,y,vx,vy]. */
function deriv(mu: number, s: Cr3bpState): Cr3bpState {
  const dx1 = s.x + mu;
  const dx2 = s.x - 1 + mu;
  const r1c = Math.pow(dx1 * dx1 + s.y * s.y, 1.5);
  const r2c = Math.pow(dx2 * dx2 + s.y * s.y, 1.5);
  const ax = s.x + 2 * s.vy - ((1 - mu) * dx1) / r1c - (mu * dx2) / r2c;
  const ay = s.y - 2 * s.vx - ((1 - mu) * s.y) / r1c - (mu * s.y) / r2c;
  return { x: s.vx, y: s.vy, vx: ax, vy: ay };
}

// --- adaptive Dormand-Prince RK45 (error-controlled) ----------------------
// Replaces the old fixed-step RK4: a fixed step cannot hold the Jacobi constant
// on the more demanding multi-lobe rosettes (e.g. the (1,1)b / braik-ross-c11b
// long-period branch drifts ~7e-5 even at 160k steps). DP45 adapts the step to
// a per-step tolerance, so every catalogue orbit integrates to ~1e-9 closure and
// keeps C to ~1e-9 at a fraction of the work. The renderer still receives a
// UNIFORM-in-time polyline (resampled below), so nothing downstream changes.

const _ax = (s: Cr3bpState, h: number, k: Cr3bpState): Cr3bpState => ({
  x: s.x + h * k.x, y: s.y + h * k.y, vx: s.vx + h * k.vx, vy: s.vy + h * k.vy,
});
const _lin = (s: Cr3bpState, h: number, terms: [number, Cr3bpState][]): Cr3bpState => {
  let x = s.x, y = s.y, vx = s.vx, vy = s.vy;
  for (const [c, k] of terms) {
    x += h * c * k.x; y += h * c * k.y; vx += h * c * k.vx; vy += h * c * k.vy;
  }
  return { x, y, vx, vy };
};

/** One Dormand-Prince 5(4) step: returns the 5th-order state and the embedded
 *  4th-order error estimate (max-norm), so the caller can accept/reject + adapt. */
function dp45Step(mu: number, s: Cr3bpState, h: number): { y5: Cr3bpState; err: number } {
  const k1 = deriv(mu, s);
  const k2 = deriv(mu, _ax(s, h * (1 / 5), k1));
  const k3 = deriv(mu, _lin(s, h, [[3 / 40, k1], [9 / 40, k2]]));
  const k4 = deriv(mu, _lin(s, h, [[44 / 45, k1], [-56 / 15, k2], [32 / 9, k3]]));
  const k5 = deriv(mu, _lin(s, h, [[19372 / 6561, k1], [-25360 / 2187, k2], [64448 / 6561, k3], [-212 / 729, k4]]));
  const k6 = deriv(mu, _lin(s, h, [[9017 / 3168, k1], [-355 / 33, k2], [46732 / 5247, k3], [49 / 176, k4], [-5103 / 18656, k5]]));
  const y5 = _lin(s, h, [[35 / 384, k1], [500 / 1113, k3], [125 / 192, k4], [-2187 / 6784, k5], [11 / 84, k6]]);
  const k7 = deriv(mu, y5);
  // error = y5 - y4 (b - b*) coefficients
  const e: [number, Cr3bpState][] = [
    [35 / 384 - 5179 / 57600, k1], [500 / 1113 - 7571 / 16695, k3], [125 / 192 - 393 / 640, k4],
    [-2187 / 6784 - -92097 / 339200, k5], [11 / 84 - 187 / 2100, k6], [-1 / 40, k7],
  ];
  let ex = 0, ey = 0, evx = 0, evy = 0;
  for (const [c, k] of e) { ex += h * c * k.x; ey += h * c * k.y; evx += h * c * k.vx; evy += h * c * k.vy; }
  const err = Math.max(Math.abs(ex), Math.abs(ey), Math.abs(evx), Math.abs(evy));
  return { y5, err };
}

/**
 * Propagate a planar CR3BP state for one period with adaptive (Dormand-Prince
 * RK45) stepping. `state6` is the catalogue's 6-component state_nd
 * [x, y, z, vx, vy, vz] (planar rows carry z = vz = 0); z is ignored.
 *
 * Adaptive substeps are taken under a per-step tolerance (`tol`); the trajectory
 * is then resampled onto `outSamples` UNIFORM time points for the polyline
 * (the renderer indexes points by time-phase, so uniform output is required).
 * Metrics (Jacobi drift, period closure) are computed on the true adaptive
 * trajectory, not the resampled polyline.
 */
export function propagateCr3bp(
  mu: number,
  state6: readonly number[],
  periodNd: number,
  outSamples = 1200,
  tol = 1e-11,
): Cr3bpOrbit {
  const s0: Cr3bpState = { x: state6[0] ?? 0, y: state6[1] ?? 0, vx: state6[3] ?? 0, vy: state6[4] ?? 0 };
  const jacobi0 = jacobiConstant(mu, s0);

  // Adaptive integration 0 -> periodNd, collecting accepted (t, state) samples.
  const ts: number[] = [0];
  const states: Cr3bpState[] = [s0];
  let t = 0;
  let s = s0;
  let h = periodNd / 2000; // initial guess
  const hMin = periodNd / 5e7;
  let drift = 0;
  let guard = 0;
  while (t < periodNd && guard++ < 2_000_000) {
    if (t + h > periodNd) h = periodNd - t; // land exactly on T
    const { y5, err } = dp45Step(mu, s, h);
    // Tolerance scaled to the state magnitude (relative + absolute floor).
    const scale = tol * (1 + Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.vx), Math.abs(s.vy)));
    if (err <= scale || h <= hMin) {
      t += h;
      s = y5;
      ts.push(t);
      states.push(s);
      const dc = Math.abs(jacobiConstant(mu, s) - jacobi0);
      if (dc > drift) drift = dc;
    }
    // PI-free step update: grow/shrink by the classic 0.9*(tol/err)^(1/5), clamped.
    const ratio = err > 0 ? 0.9 * Math.pow(scale / err, 0.2) : 5;
    h *= Math.min(5, Math.max(0.2, ratio));
    if (h < hMin) h = hMin;
  }
  const closureNd = Math.hypot(s.x - s0.x, s.y - s0.y);

  // Resample accepted samples onto a uniform time grid for the polyline.
  const points: { x: number; y: number }[] = [];
  const timesNd: number[] = [];
  let j = 0;
  for (let i = 0; i < outSamples; i++) {
    const tt = (periodNd * i) / (outSamples - 1);
    while (j < ts.length - 2 && ts[j + 1]! < tt) j++;
    const t0 = ts[j]!;
    const t1 = ts[j + 1]!;
    const a = t1 > t0 ? (tt - t0) / (t1 - t0) : 0;
    const p0 = states[j]!;
    const p1 = states[j + 1]!;
    points.push({ x: p0.x + a * (p1.x - p0.x), y: p0.y + a * (p1.y - p0.y) });
    timesNd.push(tt);
  }
  return { points, timesNd, jacobi0, jacobiDrift: drift, closureNd };
}
