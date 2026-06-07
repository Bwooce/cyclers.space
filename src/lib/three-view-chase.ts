// Pure chase-cam maths for the viz-2b 3D camera (viz phase 2b, plan Task 2.0 /
// 2.1). The chase-cam rides the spacecraft and looks along its velocity. Pure
// (no three import) so the look direction + camera pose are unit-testable with
// plain {x,y,z}; three-view.ts wraps the result in THREE.Vector3 at the call
// site.
//
// kepler-time.ts `stateAt` returns POSITION ONLY (the module notes "velocity is
// not needed ... a finite difference suffices"). So the look-along direction is
// a finite-difference of stateAt, mapped through toThree (the single ecliptic ->
// Three frame swap). Flag (recorded in the design Self-review, NOT done here):
// if finite-diff jitter is visible, the honest fix is a closed-form velocityAt
// export upstream in kepler-time.ts.

import type { KeplerElements, Vec3 } from "./kepler-time";
import { stateAt, periodDays } from "./kepler-time";
import { toThree } from "./three-axis";

export interface CameraPose {
  position: Vec3; // Three-frame world position (AU)
  lookAt: Vec3; // Three-frame world point the camera looks at (AU)
}

/** Unit look-along-velocity direction in the Three frame at clock value t:
 *  normalize(stateAt(t+delta) - stateAt(t)), delta = periodDays/4000, mapped
 *  through toThree. Returns a plain unit {x,y,z}. */
export function chaseLookDir(el: KeplerElements, t: number): Vec3 {
  const delta = periodDays(el) / 4000;
  const a = stateAt(el, t);
  const b = stateAt(el, t + delta);
  const v = toThree({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

/** Chase-cam pose: look target is the craft (toThree(stateAt)); the camera sits
 *  a trailing distance BEHIND the craft (opposite the prograde look direction)
 *  with a small lift toward Three +Y (ecliptic north) so the craft and the
 *  flyby geometry below it stay in frame as Earth/Mars sweep past. */
export function chaseCameraPose(el: KeplerElements, t: number, trail = 0.45): CameraPose {
  const lookAt = toThree(stateAt(el, t));
  const dir = chaseLookDir(el, t);
  const lift = trail * 0.35; // height above the craft, proportional to the trail
  return {
    position: {
      x: lookAt.x - dir.x * trail,
      y: lookAt.y - dir.y * trail + lift,
      z: lookAt.z - dir.z * trail,
    },
    lookAt,
  };
}
