// Client-and-build-time Kepler geometry for the per-cycler orbit view (task
// #132, design 2026-06-06-web-3d-orbit-visualization-design.md).
//
// "Seeds, not tracks": the catalogue stores sparse Kepler elements, never
// sampled paths. We reconstruct the heliocentric ellipse from (a, e) here and
// orient it by (i, Ω, ω) WHEN PRESENT — they are almost always null, in which
// case we draw the in-plane ellipse and the caller labels it coplanar-idealized
// (design §5, approval Q5). No Lambert / propagation is needed for a closed
// single ellipse: r(ν) = a(1−e²) / (1 + e·cos ν) sampled in true anomaly is
// exact (mirrors cyclers/src/cyclerfinder/viz/plots.py:182-197 but from
// elements rather than state vectors).

import type { CyclerEntry } from "./types";

export interface Vec2 {
  x: number;
  y: number;
}

// Planet circular-orbit radii (semi-major axes) and J2000 eccentricities.
// Sourced from the upstream registry — Standish & Williams, "Approximate
// Positions of the Planets", JPL Solar System Dynamics, Table 1 (a_0 / e_0
// columns); same constants as cyclers/src/cyclerfinder/core/constants.py
// (_VENUS_SMA_AU etc.). We draw planet orbits as circles at sma_au (the
// circular-coplanar idealization the catalogue's single-ellipse rows assume),
// matching plots.py:177-179.
export interface PlanetRef {
  code: string;
  name: string;
  sma_au: number;
}

export const PLANETS: Record<string, PlanetRef> = {
  V: { code: "V", name: "Venus", sma_au: 0.72333566 },
  E: { code: "E", name: "Earth", sma_au: 1.0000026 },
  M: { code: "M", name: "Mars", sma_au: 1.52371034 },
};

/** Degrees → radians. */
const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Sample a closed heliocentric ellipse from (a, e) in the ecliptic-projected
 * plane. Orientation by (inclination_deg, raan_deg, arg_periapsis_deg) is
 * applied when the angles are finite; otherwise the in-plane ellipse is drawn
 * (focus at the Sun/origin, periapsis along +x). Returns N points in AU.
 *
 * The top-down (ecliptic XY) projection loses almost nothing for this data:
 * all V/E/M cyclers sit at i ≤ ~3.4°, so the out-of-plane excursion is a few
 * pixels (design §1). The companion edge-on panel carries the z information.
 */
export function sampleEllipse(
  a: number,
  e: number,
  opts: { inclination_deg?: number | null; raan_deg?: number | null; arg_periapsis_deg?: number | null } = {},
  n = 240,
): Vec2[] {
  const p = a * (1 - e * e); // semi-latus rectum
  const i = Number.isFinite(opts.inclination_deg as number) ? rad(opts.inclination_deg as number) : 0;
  const om = Number.isFinite(opts.raan_deg as number) ? rad(opts.raan_deg as number) : 0;
  const w = Number.isFinite(opts.arg_periapsis_deg as number) ? rad(opts.arg_periapsis_deg as number) : 0;

  const cosO = Math.cos(om);
  const sinO = Math.sin(om);
  const cosI = Math.cos(i);
  const pts: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const nu = (2 * Math.PI * k) / n;
    const r = p / (1 + e * Math.cos(nu));
    // Position in the orbital plane (periapsis-aligned).
    const u = w + nu; // argument of latitude
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    // Rotate by (Ω, i) into the ecliptic, then project onto XY (drop z).
    const x = r * (cosO * cosU - sinO * sinU * cosI);
    const y = r * (sinO * cosU + cosO * sinU * cosI);
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Edge-on (X–Z) projection of the same ellipse, with the out-of-plane z
 * exaggerated by `exaggeration` so the i ≤ 3.4° structure is visible without
 * implying precision we lack (design §1, §5 — the panel carries an explicit
 * exaggeration label). When inclination is 0/null the result is a flat line on
 * z = 0 (honest: a coplanar-idealized orbit has no out-of-plane structure).
 */
export function sampleEdgeOn(
  a: number,
  e: number,
  opts: { inclination_deg?: number | null; raan_deg?: number | null; arg_periapsis_deg?: number | null },
  exaggeration: number,
  n = 240,
): Vec2[] {
  const p = a * (1 - e * e);
  const i = Number.isFinite(opts.inclination_deg as number) ? rad(opts.inclination_deg as number) : 0;
  const w = Number.isFinite(opts.arg_periapsis_deg as number) ? rad(opts.arg_periapsis_deg as number) : 0;
  const sinI = Math.sin(i);
  const pts: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const nu = (2 * Math.PI * k) / n;
    const r = p / (1 + e * Math.cos(nu));
    const u = w + nu;
    // X is the in-plane horizontal; Z is the out-of-plane component (× exagg).
    const x = r * Math.cos(u); // approximate horizontal extent for the side view
    const z = r * Math.sin(u) * sinI * exaggeration;
    pts.push({ x, y: z });
  }
  return pts;
}

/** Sample a planet's circular orbit (radius = sma_au) as a polyline. */
export function sampleCircle(radius: number, n = 180): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = (2 * Math.PI * k) / n;
    pts.push({ x: radius * Math.cos(t), y: radius * Math.sin(t) });
  }
  return pts;
}

/**
 * Idealized encounter markers for a single-ellipse cycler: the true-anomaly
 * positions where the cycler ellipse crosses each encountered planet's orbital
 * radius. This is the circular-coplanar encounter geometry (an encounter
 * happens at the planet's heliocentric distance) — labelled "idealized" by the
 * caller, distinct from real DE440 window dates. Returns at most two crossings
 * per planet (in/out bound). Bodies not crossed (radius outside [peri, apo])
 * yield none.
 */
export interface EncounterMark {
  body: string;
  pos: Vec2;
}

export function idealEncounters(a: number, e: number, bodies: string[]): EncounterMark[] {
  const peri = a * (1 - e);
  const apo = a * (1 + e);
  const p = a * (1 - e * e);
  const marks: EncounterMark[] = [];
  const seen = new Set<string>();
  for (const b of bodies) {
    if (seen.has(b)) continue;
    seen.add(b);
    const planet = PLANETS[b];
    if (!planet) continue;
    const rTarget = planet.sma_au;
    if (rTarget < peri - 1e-9 || rTarget > apo + 1e-9) continue; // ellipse never reaches it
    // r = p / (1 + e cos ν)  ⇒  cos ν = (p / r − 1) / e
    const cosNu = e === 0 ? 0 : (p / rTarget - 1) / e;
    const c = Math.max(-1, Math.min(1, cosNu));
    const nu = Math.acos(c); // outbound crossing (0..π)
    const r = rTarget;
    marks.push({ body: b, pos: { x: r * Math.cos(nu), y: r * Math.sin(nu) } });
  }
  return marks;
}

/** SVG-space point list (flips Y so +Y is up) scaled by `scale` px/AU. */
export function toSvgPath(pts: Vec2[], scale: number, cx: number, cy: number): string {
  if (pts.length === 0) return "";
  return pts
    .map((pt, idx) => `${idx === 0 ? "M" : "L"}${(cx + pt.x * scale).toFixed(2)} ${(cy - pt.y * scale).toFixed(2)}`)
    .join(" ");
}

export type RenderClass = "single-ellipse" | "multi-arc" | "non-keplerian";

export function renderClassOf(entry: CyclerEntry): RenderClass {
  const c = entry.cycler_class ?? "single-ellipse";
  if (c === "multi-arc" || c === "non-keplerian") return c;
  return "single-ellipse";
}
