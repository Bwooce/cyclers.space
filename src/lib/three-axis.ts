// The single ecliptic -> Three.js frame swap for the viz-2b 3D camera (viz
// phase 2b, design 2026-06-07-viz-phase2-timetrue-flying-camera-design.md §4).
//
// kepler-time.ts works in heliocentric J2000-ecliptic, right-handed, Sun at
// origin, AU: stateAt returns Vec3{x,y,z} with the ECLIPTIC PLANE at z=0 and +z
// ecliptic north. Three.js's default camera looks down -Z with +Y up. Mapping
// the physics frame directly would put the ecliptic on Three's XY plane and the
// camera would look at its edge — wrong.
//
// Decision (BINDING, plan §"Axis-convention decision"): map physics -> Three as
// a single fixed swap so the ecliptic becomes Three's GROUND plane (XZ) and +Y
// is ecliptic north:
//
//   three.x =  phys.x      ecliptic x          -> Three x
//   three.y =  phys.z      ecliptic north (+z) -> Three up (+y)
//   three.z = -phys.y      ecliptic y          -> Three -z  (preserves RH-ness)
//
// This is the ONLY place this swap lives — the camera, the orbit lines, and the
// markers all route through it (exactly as the SVG routes through toSvgPath). It
// keeps "slow at aphelion" reading correctly from an orbit-cam looking down on
// the ecliptic, and makes the <=3.4 deg tilt visible as real out-of-plane height
// (the y-axis). 3D works in AU world units (no px/AU scale).
//
// Returns a plain {x,y,z} so the maths is testable with ZERO three import (three
// is loaded lazily). three-view.ts wraps the result in new THREE.Vector3(...).

import type { Vec3 } from "./kepler-time";

export function toThree(v: Vec3): Vec3 {
  // `+ 0` normalises a -0 (from negating a zero y) back to +0 so the swap is a
  // clean sign-preserving permutation for the axis-aligned cases.
  return { x: v.x, y: v.z, z: -v.y + 0 };
}
