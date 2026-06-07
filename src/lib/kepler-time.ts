// Shared-clock Kepler physics for the time-true orbit view (task #139, design
// 2026-06-07-viz-phase2-timetrue-flying-camera-design.md §1). Pure TS,
// framework-free. This is the ONE home for time -> position so the SVG (and a
// future Three.js view) can never disagree about where a body is at instant t.
//
// Phase 1 (orbit.ts) walks true anomaly / arc-length uniformly, which carries
// no clock: it is too slow at periapsis and too fast at aphelion (the exact
// inverse of the truth). This module introduces the missing M -> E -> nu solve
// so motion is Kepler-true: slow at aphelion, fast at periapsis.
//
//   M(t) = M0 + n*(t - t_epoch)        mean anomaly from the clock
//   E - e*sin E = M                     Kepler's equation (Newton solve)
//   nu = 2*atan2(sqrt(1+e)*sin(E/2), sqrt(1-e)*cos(E/2))
//   r  = a*(1 - e^2)/(1 + e*cos nu)
//   x  = R3(-Om) R1(-i) R3(-w) [r cos nu, r sin nu, 0]   perifocal -> ecliptic
//
// Time unit convention: `t` and `n` (mean motion) must share a unit. The viz
// drives both planets and spacecraft on a single clock in DAYS (planet mean
// motions are deg/day upstream); deg vs rad is handled internally.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Classical orbital elements + clock anchor for one body or trajectory leg. */
export interface KeplerElements {
  a: number; // semi-major axis (AU)
  e: number; // eccentricity (0 <= e < 1 for the bound ellipses we draw)
  i_deg: number; // inclination to the ecliptic
  lan_deg: number; // longitude of ascending node (Omega)
  argp_deg: number; // argument of periapsis (omega)
  M0_deg: number; // mean anomaly at t_epoch
  n_deg_per_day?: number; // mean motion; derived from `a` via Kepler III if absent
  t_epoch_day?: number; // clock value at which M == M0 (default 0)
}

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

// Heliocentric Gauss constant: mean motion (deg/day) = K_DEG / a^1.5 (a in AU).
// Equivalent to 360 / (365.25 * a^1.5) using GM_sun in AU^3/day^2; matches the
// upstream Kepler-III derivation in cyclerfinder.core.constants to ~1e-4 deg/day
// (good enough for a viz; planets carry their exact upstream n via the JSON).
const K_DEG_PER_DAY = 0.9856076686; // 360 / 365.2568983 (sidereal-year tuned)

/** Mean motion (deg/day) from the semi-major axis via Kepler's third law. */
export function meanMotionDegPerDay(a: number): number {
  return K_DEG_PER_DAY / Math.pow(a, 1.5);
}

/** Wrap an angle (radians) into [-PI, PI]. */
function wrapPi(x: number): number {
  let a = x % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

/**
 * Solve Kepler's equation E - e*sin E = M for the eccentric anomaly E (radians).
 * Newton-Raphson seeded with E0 = M + e*sin M; converges to < 1e-12 in a few
 * iterations for the moderate eccentricities here (planets e < 0.21; spacecraft
 * ellipses can be higher but stay bound). A bisection-style damping guard keeps
 * it robust for high e where raw Newton can overshoot.
 */
export function solveKepler(M: number, e: number, tol = 1e-12, maxIter = 60): number {
  const Mw = wrapPi(M);
  let E = Mw + e * Math.sin(Mw); // standard seed
  for (let k = 0; k < maxIter; k++) {
    const f = E - e * Math.sin(E) - Mw;
    const fp = 1 - e * Math.cos(E);
    let dE = f / fp;
    // Damp the step for high e so we never overshoot past a turning point.
    if (Math.abs(dE) > 1) dE = Math.sign(dE) * 1;
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

/** True anomaly (radians) from eccentric anomaly E and eccentricity e. */
export function trueAnomaly(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/** Rotate a perifocal (z=0) position into the ecliptic frame by (Omega, i, omega). */
function perifocalToEcliptic(xp: number, yp: number, lan: number, inc: number, argp: number): Vec3 {
  const cosO = Math.cos(lan);
  const sinO = Math.sin(lan);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  const cosw = Math.cos(argp);
  const sinw = Math.sin(argp);
  // R3(Omega) R1(i) R3(omega) applied to [xp, yp, 0].
  const x =
    (cosO * cosw - sinO * sinw * cosI) * xp + (-cosO * sinw - sinO * cosw * cosI) * yp;
  const y =
    (sinO * cosw + cosO * sinw * cosI) * xp + (-sinO * sinw + cosO * cosw * cosI) * yp;
  const z = sinw * sinI * xp + cosw * sinI * yp;
  return { x, y, z };
}

/**
 * Heliocentric ecliptic position (AU) of a body at clock value `t` (days), the
 * Kepler-true state the whole viz keys off. Velocity is not needed for the
 * proximity readout (a finite difference suffices), so this returns position
 * only — the single thing both renderers ask for.
 */
export function stateAt(el: KeplerElements, t: number): Vec3 {
  const n = el.n_deg_per_day ?? meanMotionDegPerDay(el.a);
  const t0 = el.t_epoch_day ?? 0;
  const M = (el.M0_deg + n * (t - t0)) * DEG;
  const E = solveKepler(M, el.e);
  const nu = trueAnomaly(E, el.e);
  const r = (el.a * (1 - el.e * el.e)) / (1 + el.e * Math.cos(nu));
  const xp = r * Math.cos(nu);
  const yp = r * Math.sin(nu);
  return perifocalToEcliptic(xp, yp, el.lan_deg * DEG, el.i_deg * DEG, el.argp_deg * DEG);
}

/** Orbital period (days) from elements (1 / n, scaled to a full revolution). */
export function periodDays(el: KeplerElements): number {
  const n = el.n_deg_per_day ?? meanMotionDegPerDay(el.a);
  return 360 / n;
}

/**
 * Sample a closed orbit by stepping TIME uniformly over one period, converting
 * each instant to a position. Unlike the nu-uniform sampleEllipse this produces
 * dots spaced by equal time — visibly bunched at aphelion, spread at periapsis —
 * which is what makes Kepler's second law legible. The point SET (the closed
 * curve) is the same; only the parametrisation differs.
 */
export function samplePath(el: KeplerElements, nSamples = 240): Vec3[] {
  const P = periodDays(el);
  const t0 = el.t_epoch_day ?? 0;
  const pts: Vec3[] = [];
  for (let k = 0; k <= nSamples; k++) {
    pts.push(stateAt(el, t0 + (P * k) / nSamples));
  }
  return pts;
}

/** Euclidean distance (AU) between two ecliptic positions. */
export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// --- planet elements (synced from upstream constants.py via the emitter) -----

export interface PlanetElementRecord {
  code: string;
  name: string;
  a_au: number;
  e: number;
  i_deg: number;
  lan_deg: number;
  varpi_deg: number; // longitude of perihelion (Omega + omega)
  L0_deg: number; // mean longitude at J2000 (varpi + M0)
  mean_motion_deg_day: number;
}

export interface PlanetElementsDoc {
  epoch: string;
  frame: string;
  citation: string;
  bodies: PlanetElementRecord[];
}

/**
 * Convert a synced planet record (Standish reduction: omega = varpi - Omega,
 * M0 = L0 - varpi) into KeplerElements on the J2000 day clock (t in days since
 * J2000; t=0 -> the planet at its J2000 mean longitude). This is the bridge that
 * lets planets and spacecraft share one calendar clock for real-window rows.
 */
export function planetToElements(p: PlanetElementRecord): KeplerElements {
  return {
    a: p.a_au,
    e: p.e,
    i_deg: p.i_deg,
    lan_deg: p.lan_deg,
    argp_deg: p.varpi_deg - p.lan_deg,
    M0_deg: p.L0_deg - p.varpi_deg,
    n_deg_per_day: p.mean_motion_deg_day,
    t_epoch_day: 0, // J2000
  };
}

/**
 * Re-phase a body's elements so it sits at ecliptic position `target` at clock
 * value `tEnc`, by scanning its own ellipse for the true anomaly whose position
 * is nearest `target`, converting to mean anomaly, and back-solving M0. Used by
 * the idealized phase clock (design §1.3): the planet keeps its REAL mean motion
 * and shape but its absolute phase is chosen so the cycler's geometric encounter
 * actually occurs at t=tEnc — making the proximity dip reach ~0 — without ever
 * asserting a real calendar date. Honest: real n, real ellipse, chosen phase.
 */
export function rephaseToEncounter(el: KeplerElements, target: Vec3, tEnc: number): KeplerElements {
  const n = el.n_deg_per_day ?? meanMotionDegPerDay(el.a);
  const t0 = el.t_epoch_day ?? 0;
  // Scan true anomaly for the closest point on this body's ellipse to target.
  let bestNu = 0;
  let bestD = Infinity;
  const base = { ...el, M0_deg: 0, t_epoch_day: 0 };
  for (let k = 0; k < 720; k++) {
    const nu = (TWO_PI * k) / 720;
    const E = 2 * Math.atan2(Math.sqrt(1 - el.e) * Math.sin(nu / 2), Math.sqrt(1 + el.e) * Math.cos(nu / 2));
    const Mrad = E - el.e * Math.sin(E);
    const p = stateAt({ ...base, M0_deg: (Mrad / DEG) }, 0);
    const dx = p.x - target.x;
    const dy = p.y - target.y;
    const dz = p.z - target.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      bestNu = nu;
    }
  }
  // Mean anomaly at the closest point.
  const E = 2 * Math.atan2(Math.sqrt(1 - el.e) * Math.sin(bestNu / 2), Math.sqrt(1 + el.e) * Math.cos(bestNu / 2));
  const Mdeg = (E - el.e * Math.sin(E)) / DEG;
  // Want M(tEnc) == Mdeg  =>  M0 = Mdeg - n*(tEnc - t0).
  return { ...el, M0_deg: Mdeg - n * (tEnc - t0) };
}

/** Days between an ISO date (UTC) and the J2000 epoch (2000-01-01T12:00 UTC). */
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export function isoToJ2000Days(iso: string): number {
  return (Date.parse(iso) - J2000_MS) / 86_400_000;
}

// --- encounter-proximity indicator (the pedagogical headline, design §5) -----

export interface ProximitySample {
  t: number; // clock value (days)
  d_au: number; // spacecraft <-> body distance
}

export interface ProximityMinimum {
  t: number;
  d_au: number;
}

export interface ProximitySeries {
  body: string;
  samples: ProximitySample[];
  minimum: ProximityMinimum; // global closest approach over the sampled span
}

/**
 * Sample |r_sc - r_body| over a time span and locate the closest-approach
 * minimum. The dips toward ~0 ARE the encounters — the proof that the cycler is
 * a coincidence in space AND time, not just a shape crossing.
 */
export function proximitySeries(
  craft: KeplerElements,
  body: KeplerElements,
  bodyCode: string,
  t0: number,
  t1: number,
  nSamples = 360,
): ProximitySeries {
  const samples: ProximitySample[] = [];
  let minimum: ProximityMinimum = { t: t0, d_au: Infinity };
  for (let k = 0; k <= nSamples; k++) {
    const t = t0 + ((t1 - t0) * k) / nSamples;
    const d = distance(stateAt(craft, t), stateAt(body, t));
    samples.push({ t, d_au: d });
    if (d < minimum.d_au) minimum = { t, d_au: d };
  }
  return { body: bodyCode, samples, minimum };
}
