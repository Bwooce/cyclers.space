// Pure scene-geometry helpers for the viz-2b 3D camera (viz phase 2b). Extracted
// from the scene builder so they are unit-testable with ZERO three import: each
// returns plain {x,y,z} point arrays in AU world units, already routed through
// toThree (the single ecliptic -> Three frame swap). three-view.ts wraps these
// in THREE.BufferGeometry / Vector3 at mount time.
//
// Everything comes from kepler-time.ts / orbit.ts (the sourced J2000 planet
// ellipses and the cycler's own ellipse) — 2b writes no new physics.

import type { Vec3 } from "./kepler-time";
import { samplePath } from "./kepler-time";
import { samplePlanetEllipse } from "./orbit";
import { toThree } from "./three-axis";
import type { ClockConfig, SampledTrajectory } from "./three-types";

export interface OrbitLine {
  code: string;
  points: Vec3[]; // Three-frame points (AU), closed polyline
}

/** Planet orbit lines: each visited/anchor planet's sourced J2000 ellipse,
 *  routed through toThree. samplePlanetEllipse drops z (the SVG's 2D curve), so
 *  we re-add z=0 before the swap — coplanar planets sit on the Three XZ ground
 *  plane, inclined ones (Mars i=1.85) lift slightly off it. */
export function buildOrbitLinePoints(cfg: ClockConfig): OrbitLine[] {
  return cfg.planets.map((p) => ({
    code: p.code,
    points: samplePlanetEllipse(p.code).map((q) => toThree({ x: q.x, y: q.y, z: 0 })),
  }));
}

/** The cycler's inked trajectory: one full period of samplePath(craft) (time-
 *  uniform, so dots bunch at aphelion), routed through toThree. Carries the real
 *  z so an inclined cycler lifts off the ecliptic plane. */
export function buildCraftPathPoints(cfg: ClockConfig): Vec3[] {
  return samplePath(cfg.craft).map((p) => toThree(p));
}

// --- viz-2c: sampled-trajectory craft path ---------------------------------
//
// The sampled-source counterpart to buildCraftPathPoints. The craft polyline IS
// the integrator's own samples (no resampling, no interpolation here — the
// stored points are the curve), each routed through toThree. This is what the
// 3D Line draws when cfg.craftSampled is present. Per-point transform replaces
// the analytic samplePath; the tilt morph (2D) and any per-point camera work act
// on these same points so sampled and analytic curves share one pipeline.

/** The sampled cycler trajectory in Three-frame points (AU). Each stored sample
 *  is mapped through toThree; the polyline is exactly the sampled data. */
export function buildSampledPathPoints(s: SampledTrajectory): Vec3[] {
  return s.positionsAU.map(([x, y, z]) => toThree({ x, y, z }));
}

/** The sampled cycler trajectory as an SVG path string (top-down ecliptic
 *  projection), the sampled-source counterpart to toSvgPath(sampleEllipse(...)).
 *  Uses the ecliptic (x, y) directly with the SVG's px/AU scale + centre, so the
 *  sampled curve overlays the analytic one pixel-for-pixel for the same orbit. */
export function buildSampledSvgPath(s: SampledTrajectory, scale: number, cx: number, cy: number): string {
  if (s.positionsAU.length === 0) return "";
  return s.positionsAU
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${(cx + x * scale).toFixed(2)} ${(cy - y * scale).toFixed(2)}`)
    .join(" ");
}
