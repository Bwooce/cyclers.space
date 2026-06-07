// Pure guided-tour keyframe maths for the viz-2b 3D camera (viz phase 2b, plan
// Task 3.0). The tour walks the didactic beats — departure -> flyby -> aphelion
// -> return phasing — with each keyframe DERIVED FROM THE GEOMETRY of the shared
// clockConfig, never hardcoded per cycler row (design §4.2). Pure (no three
// import) so the keyframe timeline + poses are unit-testable with plain {x,y,z};
// three-view.ts wraps each pose in THREE.Vector3 and lerps between them.
//
// Every position routes through stateAt (the one clock) and toThree (the one
// frame swap) — the tour invents no geometry. The flyby instant reuses the
// proximity-series minimum the 2a build already computed (surfaced in
// clockConfig.proximityMinima, Task 1.0b); aphelion is a radius scan over
// [t0,t1]; departure/return anchor to t0/t1.

import { stateAt } from "./kepler-time";
import { markerWorldPos } from "./three-clock";
import type { CameraPose } from "./three-view-chase";
import type { ClockConfig } from "./three-types";

export type TourBeat = "departure" | "flyby" | "aphelion" | "return";

export interface TourKeyframe {
  beat: TourBeat;
  t: number; // clock value (days) for this beat
  pose: CameraPose; // Three-frame camera position + look target (AU)
  caption: string; // didactic narration carried into the live region
}

/** Scan the craft's heliocentric radius over [t0,t1] for the aphelion instant
 *  (max |stateAt(craft,t)|) — the payoff beat where Kepler's second law makes
 *  time visibly slow. */
function aphelionTime(cfg: ClockConfig, nScan = 360): number {
  const span = cfg.t1 - cfg.t0 || 1;
  let bestT = cfg.t0;
  let bestR = -Infinity;
  for (let k = 0; k <= nScan; k++) {
    const t = cfg.t0 + (span * k) / nScan;
    const p = stateAt(cfg.craft, t);
    const r = Math.hypot(p.x, p.y, p.z);
    if (r > bestR) {
      bestR = r;
      bestT = t;
    }
  }
  return bestT;
}

/** A camera pose looking at the craft at instant t, lifted above the ecliptic
 *  (+Y) and offset toward the Sun by `dist` AU so the look target and its
 *  surroundings stay in frame. Larger `dist` => further back (used to pull out
 *  at aphelion, push in at the flyby). */
function poseLookingAtCraft(cfg: ClockConfig, t: number, dist: number): CameraPose {
  const lookAt = markerWorldPos(cfg.craft, t);
  // Direction from the Sun (origin) out to the craft, in the Three frame; back
  // the camera off along it (toward the Sun) and lift it above the plane.
  const r = Math.hypot(lookAt.x, lookAt.y, lookAt.z) || 1;
  const ux = lookAt.x / r;
  const uz = lookAt.z / r;
  return {
    position: {
      x: lookAt.x - ux * dist,
      y: lookAt.y + dist * 0.6,
      z: lookAt.z - uz * dist,
    },
    lookAt,
  };
}

/** Build the geometry-derived tour timeline for a single-ellipse row. Beats are
 *  emitted in time order. The flyby beat is omitted when no proximity minimum is
 *  available (nothing to fly to) — departure/aphelion/return are always present
 *  because they are purely geometric. */
export function tourKeyframes(cfg: ClockConfig): TourKeyframe[] {
  const ap = cfg.craft.a * (1 + cfg.craft.e); // analytic aphelion radius (AU)
  const near = Math.max(0.12, ap * 0.18); // close dolly for the flyby
  const wide = Math.max(0.8, ap * 1.6); // pull-back for departure / aphelion

  const departure: TourKeyframe = {
    beat: "departure",
    t: cfg.t0,
    pose: poseLookingAtCraft(cfg, cfg.t0, wide * 0.6),
    caption: "Earth departure.",
  };

  const apT = aphelionTime(cfg);
  const aphelion: TourKeyframe = {
    beat: "aphelion",
    t: apT,
    pose: poseLookingAtCraft(cfg, apT, wide),
    caption: "Long aphelion arc — time visibly slows (Kepler's second law).",
  };

  const returnKf: TourKeyframe = {
    beat: "return",
    t: cfg.t1,
    pose: poseLookingAtCraft(cfg, cfg.t1, wide * 0.6),
    caption: "Earth-return phasing.",
  };

  const min = cfg.proximityMinima?.[0];
  if (!min) {
    return [departure, aphelion, returnKf];
  }

  const flyby: TourKeyframe = {
    beat: "flyby",
    t: min.t,
    pose: poseLookingAtCraft(cfg, min.t, near),
    caption: cfg.encProvenance ? `Flyby — ${cfg.encProvenance}.` : "Flyby.",
  };

  // Emit in beat order, then sort by t so the lerp always advances forward.
  return [departure, flyby, aphelion, returnKf].sort((a, b) => a.t - b.t);
}
