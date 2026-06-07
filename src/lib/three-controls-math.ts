// Pure spherical-camera maths for the viz-2b orbit-cam (viz phase 2b, plan Task
// 1.4). Extracted so the framing + pose maths are unit-testable with ZERO three
// import (plain {x,y,z}); three-controls.ts wraps the result in a Vector3.

import type { Vec3 } from "./kepler-time";
import { stateAt } from "./kepler-time";
import type { ClockConfig } from "./three-types";

/** Initial camera radius (AU): framed so the whole trajectory fits. We scan the
 *  craft's heliocentric radius over one period for its true aphelion and pad it
 *  so the orbit and the outermost visited planet sit comfortably in frame. */
export function frameRadiusAU(cfg: ClockConfig, nScan = 240): number {
  let maxR = cfg.craft.a * (1 + cfg.craft.e); // analytic aphelion as the floor
  const P = cfg.t1 - cfg.t0 || 1;
  for (let k = 0; k <= nScan; k++) {
    const t = cfg.t0 + (P * k) / nScan;
    const p = stateAt(cfg.craft, t);
    const r = Math.hypot(p.x, p.y, p.z);
    if (r > maxR) maxR = r;
  }
  // Include the outermost visited planet's aphelion so it is in frame too.
  for (const pl of cfg.planets) {
    const ap = pl.el.a * (1 + pl.el.e);
    if (ap > maxR) maxR = ap;
  }
  return maxR * 1.8; // pad: perspective FoV margin so nothing clips the rim
}

/** Camera world position from spherical coords about the target (the origin).
 *  azimuth is rotation in the ecliptic ground plane (Three XZ); elevation is the
 *  angle above it toward +Y (ecliptic north). elevation = +PI/2 => straight
 *  down the +Y axis (the default "looking down on the ecliptic" pose). */
export function cameraPoseFromSpherical(radius: number, azimuth: number, elevation: number): Vec3 {
  const cosEl = Math.cos(elevation);
  return {
    x: radius * cosEl * Math.sin(azimuth),
    y: radius * Math.sin(elevation),
    z: radius * cosEl * Math.cos(azimuth),
  };
}
