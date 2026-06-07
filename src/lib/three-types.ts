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
}
