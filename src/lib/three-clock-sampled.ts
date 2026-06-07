// viz-2c sampled-trajectory clock: time -> position by INTERPOLATION over a
// numerically-sampled polyline, the sampled-source counterpart to kepler-time's
// stateAt (which solves Kepler's equation for an analytic ellipse). Pure TS,
// zero three import, so it is unit-testable and so the SVG island and the 3D
// view share ONE interpolation rule (one clock, two renderers) — exactly as 2b
// shared stateAt.
//
// INTERPOLATION CHOICE — linear, documented:
//   We linear-interpolate position between the two bracketing samples. This is
//   the honest first choice for a sampled trajectory: it introduces NO model
//   beyond "a straight line between adjacent states", so it can never imply
//   dynamics the exporter did not compute (a cubic/Hermite spline would invent
//   curvature between samples and could read as fidelity the n-body run did not
//   produce). At the fixture's ~5-day step the chord error vs the true ellipse
//   is tiny (asserted in the fixture coincidence test); a future exporter that
//   wants smoother motion should emit DENSER samples rather than us upgrading
//   the interpolant — the data, not the renderer, owns the fidelity.
//
// TIME UNIT: SampledTrajectory.timesSec is in SECONDS (the natural unit an
// integrator emits). The rest of the viz clock runs in DAYS (kepler-time). The
// caller passes a time in the SAME unit it sampled in; `sampleToClockDays`
// converts the sampled span onto the day clock so a sampled craft can share the
// t0..t1 day window with the analytic planets.

import type { Vec3 } from "./kepler-time";
import type { SampledTrajectory } from "./three-types";

const SEC_PER_DAY = 86_400;

/** First/last sample time in DAYS (the sampled span on the shared day clock). */
export function sampledSpanDays(s: SampledTrajectory): { t0: number; t1: number } {
  const n = s.timesSec.length;
  if (n === 0) return { t0: 0, t1: 0 };
  return { t0: s.timesSec[0]! / SEC_PER_DAY, t1: s.timesSec[n - 1]! / SEC_PER_DAY };
}

/**
 * Position (AU, sample frame) at clock value `tDay` (DAYS), by linear
 * interpolation over the sampled polyline. Behaviour at the edges is CLAMPING:
 * a time before the first sample returns the first position, after the last
 * returns the last — never an extrapolation (we never invent state outside what
 * the integrator produced). Endpoints return the exact stored sample.
 */
export function sampledStateAt(s: SampledTrajectory, tDay: number): Vec3 {
  const times = s.timesSec;
  const pos = s.positionsAU;
  const n = times.length;
  if (n === 0) return { x: 0, y: 0, z: 0 };
  const tSec = tDay * SEC_PER_DAY;
  // Clamp below / above the sampled span.
  if (tSec <= times[0]!) return vec(pos[0]!);
  if (tSec >= times[n - 1]!) return vec(pos[n - 1]!);
  // Binary search for the bracketing interval [i, i+1] with times[i] <= tSec.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= tSec) lo = mid;
    else hi = mid;
  }
  const ta = times[lo]!;
  const tb = times[hi]!;
  const span = tb - ta;
  const f = span > 0 ? (tSec - ta) / span : 0;
  const a = pos[lo]!;
  const b = pos[hi]!;
  return {
    x: a[0] + (b[0] - a[0]) * f,
    y: a[1] + (b[1] - a[1]) * f,
    z: a[2] + (b[2] - a[2]) * f,
  };
}

/** Validate monotonic (strictly increasing) sample times — a precondition of
 *  the bracketing search. Returns the index of the first non-increasing step,
 *  or -1 if the series is strictly increasing (or too short to violate it). */
export function firstNonMonotonicIndex(s: SampledTrajectory): number {
  for (let i = 1; i < s.timesSec.length; i++) {
    if (s.timesSec[i]! <= s.timesSec[i - 1]!) return i;
  }
  return -1;
}

function vec(p: [number, number, number]): Vec3 {
  return { x: p[0], y: p[1], z: p[2] };
}
