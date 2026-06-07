// Shared types for the viz-2b 3D camera (viz phase 2b). The ClockConfig mirrors
// the `clockConfig` object OrbitView.astro serialises into the
// `data-orbit-config` JSON (the synchronisation contract). 2b reads it; it adds
// no second source of truth. Kept in its own pure module so both three-view.ts
// and the unit tests can import it with zero three dependency.

import type { KeplerElements } from "./kepler-time";

export interface ProximityMinimumConfig {
  body: string;
  t: number;
  d_au: number;
}

// --- viz-2c: sampled-trajectory geometry source ----------------------------
//
// viz-2b renders the spacecraft from a single analytic Kepler ellipse
// (cfg.craft). viz-2c adds a SECOND way to describe the same craft curve: a
// numerically-sampled polyline of (time, position) pairs, so n-body integrated
// trajectories and multi-arc concatenations — which have no single closed-form
// (a,e) — can render in the SAME SVG + 3D system. The clock for a sampled
// source is INTERPOLATION over the samples (see three-clock-sampled.ts),
// replacing the Kepler M->E->nu solve.
//
// ADAPTER POINT (the one thin seam for the future Phase-C n-body exporter):
// the real exporter must emit exactly a `SampledTrajectory` object — same field
// names, same units (seconds for time, AU for position, eclipJ2000 frame) — and
// drop it into the clockConfig as `craftSampled`. Nothing else in the renderer
// changes: three-geometry-sampled.ts + three-clock-sampled.ts already consume
// this shape. Until that exporter lands, the only producer is the synthetic
// dev fixture in src/lib/__fixtures__/sampled-fixture.ts (clearly labelled
// "synthetic demo" in the honesty caption). Do NOT manufacture per-row sampled
// data from catalogue values here — that would fake fidelity the data lacks.

/** A numerically-sampled trajectory: parallel time / position arrays. The clock
 *  interpolates between samples rather than solving Kepler's equation. */
export interface SampledTrajectory {
  kind: "sampled";
  /** Sample times, seconds, strictly increasing (monotonic). */
  timesSec: number[];
  /** Heliocentric positions (AU) at each time, [x, y, z] in the sample frame. */
  positionsAU: [number, number, number][];
  /** Reference frame the positions are expressed in. */
  frame: "eclipJ2000";
  /** Free-text model fidelity, e.g. "n-body (REBOUND IAS15)" or
   *  "synthetic demo (Kepler ellipse resampled)". Surfaced in the caption. */
  fidelity: string;
  /** Where the samples came from (exporter id / fixture note). Caption text. */
  provenance: string;
}

export interface ClockConfig {
  regime: "real-window-anchored" | "idealized-phase";
  t0: number;
  t1: number;
  craft: KeplerElements;
  planets: { code: string; el: KeplerElements }[];
  scale: number;
  cx: number;
  cy: number;
  bodies: string[];
  // Additive viz-2b fields (Task 1.0b). encounterTimes is populated only for
  // idealized-phase rows; the camera's "t = first encounter" default falls back
  // to t0 when absent.
  encounterTimes?: number[];
  proximityMinima?: ProximityMinimumConfig[];
  // Honesty strings (design §5), carried verbatim from the SVG figcaption.
  fidelityBadge?: string;
  clockLabel?: string;
  encProvenance?: string;
  planetCitation?: string;
  // viz-2c: an OPTIONAL numerically-sampled spacecraft trajectory. When present
  // the renderers draw the craft from this polyline (interpolated clock) instead
  // of the analytic `craft` ellipse; `craft` stays populated as the time-base /
  // framing fallback (period, aphelion for camera distance). The planets always
  // stay analytic (Standish osculating ellipses) — only the craft can be
  // sampled in this slice.
  craftSampled?: SampledTrajectory;
}
