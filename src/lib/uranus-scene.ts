// Pure geometry + constants for the Uranian moon-pair quasi-cycler hero scene
// (2026-07, upstream #558-#569: the #312 Umbriel-Oberon-Umbriel family, six
// V4 representatives written into the catalogue in commit 8efabd5 of
// Bwooce/cyclers). Framework-free, no three import — shared by the build-time
// SVG poster (poster-svg.ts) and the lazily-loaded 3D gallery (hero-gallery.ts),
// mirroring the cr3bp-propagate.ts / kepler-time.ts split.
//
// Data honesty: these six rows carry NO orbit_elements (no state vector, no
// per-arc conics — see hero-data.ts's effectivePrimary() doc comment for why
// they also carry no `primary` field). What they DO carry, real and sourced:
//   - bodies[1], bodies[2]: the two encountered moons
//   - vinf_kms_at_encounters: the real V-infinity triplet at each flyby
//   - validity_window.synodic_*: the measured synodic-resonance timing
//   - orbit_fidelity / vinf_fidelity: "circular-coplanar" — the ROW ITSELF
//     records that its own generating model treats the moon orbits as
//     circular and coplanar (Uranus-equatorial frame), so drawing them that
//     way here is reproducing the row's own recorded model, not inventing one.
//
// What this module draws for the "transfer arc" between two moon orbits is an
// IDEALIZED two-body Hohmann-type transfer ellipse between their real sourced
// circular radii — a first-order visual proxy, explicitly NOT the row's own
// computed trajectory (which came from a CR3BP-based symmetric-closure search
// against real URA111 ephemeris). Every consumer must caption this distinction
// (see fidelityFor() below) — never let the idealized curve read as the real one.

/** Uranus system GM (JPL DE440 planetary constants, ssd.jpl.nasa.gov astro_par):
 *  5.7945564e6 km^3/s^2. Same source + value as cyclerfinder.core.satellites.py
 *  PRIMARIES["Uranus"] (accessed 2026-06-14 upstream). */
export const URANUS_MU_KM3S2 = 5.7945564e6;

export interface UranusMoonRef {
  name: string;
  /** Semi-major axis about Uranus, km. */
  smaKm: number;
}

/** The four non-Miranda regular Uranian moons this family's rows encounter.
 *  Semi-major axes (km): JPL Solar System Dynamics satellite physical/orbital
 *  tables (ssd.jpl.nasa.gov), the SAME values as
 *  cyclerfinder.core.satellites.py SATELLITES (Ariel 190929, Umbriel 265986,
 *  Titania 436298, Oberon 583511 km), accessed 2026-06-07 upstream. Miranda is
 *  excluded — none of the six catalogued representatives encounter it. */
export const URANUS_MOONS: Record<string, UranusMoonRef> = {
  Ariel: { name: "Ariel", smaKm: 190929.0 },
  Umbriel: { name: "Umbriel", smaKm: 265986.0 },
  Titania: { name: "Titania", smaKm: 436298.0 },
  Oberon: { name: "Oberon", smaKm: 583511.0 },
};

export const URANUS_MOON_CITATION =
  "JPL Solar System Dynamics gm_de440 planetary constants (Uranus system GM) + satellite physical/orbital tables (moon semi-major axes), ssd.jpl.nasa.gov — the same registry as cyclerfinder.core.satellites.py";

/** Deterministic moon-pair ordering: the six 2-combinations of the four moons,
 *  sorted by (inner sma, outer sma) so the order is stable and matches the
 *  natural "closest pair first" reading. Used to fan the six transfer arcs
 *  out to distinct azimuths so they don't all draw on top of each other. */
export function orderedMoonPairs(): [string, string][] {
  const names = Object.keys(URANUS_MOONS).sort((a, b) => URANUS_MOONS[a]!.smaKm - URANUS_MOONS[b]!.smaKm);
  const pairs: [string, string][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      pairs.push([names[i]!, names[j]!]);
    }
  }
  return pairs.sort((a, b) => {
    const da = URANUS_MOONS[a[0]]!.smaKm;
    const db = URANUS_MOONS[b[0]]!.smaKm;
    return da !== db ? da - db : URANUS_MOONS[a[1]]!.smaKm - URANUS_MOONS[b[1]]!.smaKm;
  });
}

/** Mean motion (deg/day) about a primary from Kepler's third law — the same
 *  formula as cyclerfinder.core.satellites.mean_motion_deg_day_about, but
 *  kept local (no shared import) so this module stays a single pure file. */
export function meanMotionDegPerDayAbout(smaKm: number, muKm3s2: number): number {
  const periodS = 2 * Math.PI * Math.sqrt(Math.pow(smaKm, 3) / muKm3s2);
  return 360 / (periodS / 86400);
}

export interface HohmannElements {
  aKm: number;
  e: number;
  /** true if moonA's radius is the periapsis side (moonA is the inner moon). */
  aIsPeriapsis: boolean;
}

/** Shape of the idealized two-body Hohmann-type transfer ellipse whose two
 *  apsides sit exactly on the two moons' real circular radii. */
export function hohmannElements(smaAKm: number, smaBKm: number): HohmannElements {
  const rp = Math.min(smaAKm, smaBKm);
  const ra = Math.max(smaAKm, smaBKm);
  const aKm = (rp + ra) / 2;
  const e = ra !== rp ? (ra - rp) / (ra + rp) : 0;
  return { aKm, e, aIsPeriapsis: smaAKm <= smaBKm };
}

/**
 * Sample the Hohmann-type transfer arc (periapsis -> apoapsis, true anomaly
 * 0..pi — the half-ellipse a real 2-impulse Hohmann transfer actually flies)
 * in a 2D plane, periapsis placed at `azimuthDeg`. Static illustrative
 * geometry (not time-parametrized) — this idealized arc stands in for BOTH
 * legs of a row's real symmetric closure (see the module doc comment).
 */
export function hohmannArcPoints(
  el: HohmannElements,
  azimuthDeg: number,
  nSamples = 96,
): { x: number; y: number }[] {
  const az = (azimuthDeg * Math.PI) / 180;
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k <= nSamples; k++) {
    const nu = (Math.PI * k) / nSamples;
    const r = (el.aKm * (1 - el.e * el.e)) / (1 + el.e * Math.cos(nu));
    const theta = nu + az;
    pts.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
  }
  return pts;
}

/** Fixed 60-degree fan spacing for the six ordered moon pairs (pure
 *  presentation choice for legibility — the illustrated relative azimuth
 *  between different moon-pair arcs is NOT asserted physical phasing; every
 *  scene caption using this module must say so). */
export function azimuthForPairIndex(index: number, totalPairs = 6): number {
  return (index * 360) / totalPairs;
}
