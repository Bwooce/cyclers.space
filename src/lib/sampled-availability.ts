// viz-2c gating: does a row have a sampled trajectory available to render in 3D?
//
// 2b gated the "View in 3D" button to single-ellipse rows and showed an honest
// "not available in 3D yet" note for multi-arc rows (each leg is its own ellipse
// with no single closed form). 2c adds a sampled path that COULD render those
// rows — but only if real sampled data exists for them. The Phase-C exporter
// (cyclers repo `scripts/export_sampled_trajectories.py`) now publishes per-row
// sampled files into `public/data/sampled/<id>.json`; this module is the single
// decision point that knows which rows have one, so the multi-arc gate opens for
// exactly those rows and no others.
//
// LAZY-LOAD SEAM (the zero-cost-when-unused invariant, design §4.1): we do NOT
// embed the sampled polyline inline. `sampledUrlFor` returns only a small URL
// STRING (build-time, ships in the clockConfig); the OrbitView click handler
// fetches the JSON and populates `cfg.craftSampled` ONLY when the user opens 3D.
// So a row's sampled data costs zero bytes until intent — same guarantee as the
// three.js chunk itself.
//
// `sampledTrajectoryFor` stays null: there is no INLINE producer (embedding the
// polyline would defeat the lazy-load proof). It survives as the build-time data
// accessor's documented shape; the real data arrives at runtime via the URL.
// We deliberately DO NOT synthesise sampled data from catalogue (a,e) values —
// that would assert a fidelity the data lacks; only an exported file counts.

import type { CyclerEntry } from "./types";
import type { SampledTrajectory } from "./three-types";

/**
 * Catalogue ids with a published sampled-trajectory file under
 * `public/data/sampled/<id>.json` (emitted by the cyclers-repo exporter). The
 * single source of truth for "this row has real sampled geometry". Add an id
 * here only once its file is exported and committed.
 */
const PUBLISHED_SAMPLED_IDS = new Set<string>([
  "aldrin-classic-em-k1-outbound", // viz-2c first exhibit: 3-lap powered Aldrin
]);

/**
 * The public URL of a row's sampled-trajectory JSON, or null if none is
 * published. A small string (NOT the polyline) so it can ride the inline
 * clockConfig; the renderer fetches it lazily on "View in 3D".
 */
export function sampledUrlFor(entry: CyclerEntry): string | null {
  return PUBLISHED_SAMPLED_IDS.has(entry.id)
    ? `/data/sampled/${entry.id}.json`
    : null;
}

/**
 * The sampled trajectory for a catalogue row, or null. There is NO inline
 * producer: the real data is fetched lazily by URL (see `sampledUrlFor`), so
 * embedding it here would defeat the zero-cost-when-unused proof. Always null.
 */
export function sampledTrajectoryFor(_entry: CyclerEntry): SampledTrajectory | null {
  return null;
}

/**
 * Whether a row can render in 3D via the sampled path. CR3BP (non-keplerian)
 * rows are NEVER eligible — they live in a rotating frame and a heliocentric
 * sampled polyline would misrepresent them. Multi-arc and single-ellipse rows
 * become eligible once a sampled file is published for them.
 */
export function canRenderSampled3D(entry: CyclerEntry): boolean {
  const cls = entry.cycler_class ?? "single-ellipse";
  if (cls === "non-keplerian") return false;
  return sampledUrlFor(entry) !== null;
}
