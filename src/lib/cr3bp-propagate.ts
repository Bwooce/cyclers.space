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

function rk4Step(mu: number, s: Cr3bpState, h: number): Cr3bpState {
  const k1 = deriv(mu, s);
  const k2 = deriv(mu, { x: s.x + (h / 2) * k1.x, y: s.y + (h / 2) * k1.y, vx: s.vx + (h / 2) * k1.vx, vy: s.vy + (h / 2) * k1.vy });
  const k3 = deriv(mu, { x: s.x + (h / 2) * k2.x, y: s.y + (h / 2) * k2.y, vx: s.vx + (h / 2) * k2.vx, vy: s.vy + (h / 2) * k2.vy });
  const k4 = deriv(mu, { x: s.x + h * k3.x, y: s.y + h * k3.y, vx: s.vx + h * k3.vx, vy: s.vy + h * k3.vy });
  return {
    x: s.x + (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    vx: s.vx + (h / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
    vy: s.vy + (h / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
  };
}

/**
 * Propagate a planar CR3BP state for one period. `state6` is the catalogue's
 * 6-component state_nd [x, y, z, vx, vy, vz] (planar rows carry z = vz = 0);
 * z components are ignored — the Ross rows are PCR3BP by construction.
 *
 * `nSteps` integration steps are taken; every `keepEvery`-th sample is kept
 * for the polyline (the metrics are computed over ALL steps).
 */
export function propagateCr3bp(
  mu: number,
  state6: readonly number[],
  periodNd: number,
  nSteps = 160000,
  keepEvery = 160,
): Cr3bpOrbit {
  const s0: Cr3bpState = { x: state6[0] ?? 0, y: state6[1] ?? 0, vx: state6[3] ?? 0, vy: state6[4] ?? 0 };
  const h = periodNd / nSteps;
  const jacobi0 = jacobiConstant(mu, s0);
  let s = s0;
  let drift = 0;
  const points: { x: number; y: number }[] = [{ x: s0.x, y: s0.y }];
  const timesNd: number[] = [0];
  for (let k = 1; k <= nSteps; k++) {
    s = rk4Step(mu, s, h);
    const dc = Math.abs(jacobiConstant(mu, s) - jacobi0);
    if (dc > drift) drift = dc;
    if (k % keepEvery === 0 || k === nSteps) {
      points.push({ x: s.x, y: s.y });
      timesNd.push(k * h);
    }
  }
  const closureNd = Math.hypot(s.x - s0.x, s.y - s0.y);
  return { points, timesNd, jacobi0, jacobiDrift: drift, closureNd };
}
