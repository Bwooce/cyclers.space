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
import type { ClockConfig } from "./three-types";

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
