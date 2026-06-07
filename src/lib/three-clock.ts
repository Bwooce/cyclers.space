// Pure shared-clock helpers for the viz-2b 3D markers (viz phase 2b, plan Task
// 1.5). Marker positions come from the SAME stateAt the SVG island calls, routed
// through toThree — one clock, two renderers. Pure (no three) so unit-testable.

import type { KeplerElements, Vec3 } from "./kepler-time";
import { stateAt } from "./kepler-time";
import { toThree } from "./three-axis";
import type { ClockConfig } from "./three-types";

/** A body's Three-frame world position (AU) at clock value t. */
export function markerWorldPos(el: KeplerElements, t: number): Vec3 {
  return toThree(stateAt(el, t));
}

/** The opening instant: the camera opens PAUSED at the first encounter (design
 *  §4.2). Idealized-phase rows carry encounterTimes; real-window rows anchor t0
 *  to the encounter date, so t0 IS the encounter — fall back to it. */
export function defaultStartTime(cfg: ClockConfig): number {
  const enc = cfg.encounterTimes;
  if (enc && enc.length > 0) return enc[0]!;
  return cfg.t0;
}
