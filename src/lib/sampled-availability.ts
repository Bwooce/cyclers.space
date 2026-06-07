// viz-2c gating: does a row have a sampled trajectory available to render in 3D?
//
// 2b gated the "View in 3D" button to single-ellipse rows and showed an honest
// "not available in 3D yet" note for multi-arc rows (each leg is its own ellipse
// with no single closed form). 2c adds a sampled path that COULD render those
// rows — but only if real sampled data exists for them. The real n-body / multi-
// arc exporter (Phase C) does not exist yet, so NO catalogue row carries sampled
// data today. This module is the single decision point so the day the exporter
// lands, one function flips and the gate opens — without faking data now.
//
// ADAPTER POINT (paired with three-types.ts SampledTrajectory): when the Phase-C
// exporter writes a per-row sampled file, the loader populates
// `entry`-side sampled data and `sampledTrajectoryFor` returns it. Until then it
// returns null for every row, and `canRenderSampled3D` is false everywhere — so
// CR3BP stays excluded (rotating frame, never heliocentric-sampled here) and
// multi-arc keeps its honest note. We deliberately DO NOT synthesise sampled
// data from catalogue (a,e) values: that would assert a fidelity the data lacks.

import type { CyclerEntry } from "./types";
import type { SampledTrajectory } from "./three-types";

/**
 * The sampled trajectory for a catalogue row, or null if none is published.
 *
 * THERE IS NO REAL PRODUCER YET. This returns null for every row until the
 * Phase-C exporter exists; the synthetic fixture (src/lib/__fixtures__) is the
 * only SampledTrajectory in the codebase and is wired only in tests / dev demos,
 * never sourced from a catalogue row here.
 */
export function sampledTrajectoryFor(_entry: CyclerEntry): SampledTrajectory | null {
  return null;
}

/**
 * Whether a row can render in 3D via the sampled path. CR3BP (non-keplerian)
 * rows are NEVER eligible — they live in a rotating frame and a heliocentric
 * sampled polyline would misrepresent them. Multi-arc and single-ellipse rows
 * become eligible only once `sampledTrajectoryFor` yields data (none do yet).
 */
export function canRenderSampled3D(entry: CyclerEntry): boolean {
  const cls = entry.cycler_class ?? "single-ellipse";
  if (cls === "non-keplerian") return false;
  return sampledTrajectoryFor(entry) !== null;
}
