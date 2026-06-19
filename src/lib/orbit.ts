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
import planetElementsDoc from "../data/planet-elements.json";
import { planetToElements, samplePath, type PlanetElementRecord, type PlanetElementsDoc } from "./kepler-time";

export interface Vec2 {
  x: number;
  y: number;
}

// Planet J2000 osculating elements, synced from the upstream single source of
// truth — Standish & Williams, "Approximate Positions of the Planets", JPL
// Solar System Dynamics, Table 1 — emitted from
// cyclers/src/cyclerfinder/core/constants.py by scripts/emit-planet-elements.py
// into planet-elements.json (Phase 2, task #139). Phase 1 drew planets as pure
// circles at sma_au; Phase 2 draws their TRUE ellipses (Mars's e=0.0934 is now
// represented), and places them at their true longitudes on the shared clock.
const PLANET_DOC = planetElementsDoc as PlanetElementsDoc;

/** Provenance string for the planet geometry (surfaced in the caption). */
export const PLANET_GEOMETRY_CITATION = PLANET_DOC.citation;

export interface PlanetRef {
  code: string;
  name: string;
  sma_au: number;
  record: PlanetElementRecord;
}

export const PLANETS: Record<string, PlanetRef> = Object.fromEntries(
  PLANET_DOC.bodies.map((b) => [b.code, { code: b.code, name: b.name, sma_au: b.a_au, record: b }]),
);

/** Sample a planet's TRUE J2000 ellipse (closed curve) as a polyline in AU. */
export function samplePlanetEllipse(code: string, n = 240): Vec2[] {
  const ref = PLANETS[code];
  if (!ref) return [];
  return samplePath(planetToElements(ref.record), n).map((p) => ({ x: p.x, y: p.y }));
}

/** Degrees → radians. */
const rad = (deg: number): number => (deg * Math.PI) / 180;
const TWO_PI = 2 * Math.PI;

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
 * Idealized (geometry-only) encounter markers for a single-ellipse cycler: the
 * point on the cycler ellipse that comes CLOSEST to each encountered planet's
 * real J2000 ellipse (design §2 fallback #2). Phase 1 used the planet's circular
 * radius crossing; with the planet now on a real eccentric ellipse the crossing
 * is no longer a single radius, so we generalise to minimum distance between the
 * two curves. Labelled "idealized crossing geometry" by the caller — distinct
 * from the time-true marker (the planet's position AT the encounter time) used
 * when a clock exists, and from real DE440 window dates. Returns one mark per
 * encountered body that the cycler ellipse can plausibly reach.
 */
export interface EncounterMark {
  body: string;
  pos: Vec2;
  nu: number;
}

export function idealEncounters(
  a: number,
  e: number,
  opts: { inclination_deg?: number | null; raan_deg?: number | null; arg_periapsis_deg?: number | null },
  bodies: string[]
): EncounterMark[] {
  const peri = a * (1 - e);
  const apo = a * (1 + e);
  const p = a * (1 - e * e);
  
  const i = Number.isFinite(opts.inclination_deg as number) ? (opts.inclination_deg as number) * Math.PI / 180 : 0;
  const om = Number.isFinite(opts.raan_deg as number) ? (opts.raan_deg as number) * Math.PI / 180 : 0;
  const w = Number.isFinite(opts.arg_periapsis_deg as number) ? (opts.arg_periapsis_deg as number) * Math.PI / 180 : 0;
  const cosO = Math.cos(om);
  const sinO = Math.sin(om);
  const cosI = Math.cos(i);

  const marks: EncounterMark[] = [];
  const seen = new Set<string>();
  for (const b of bodies) {
    if (seen.has(b)) continue;
    seen.add(b);
    const planet = PLANETS[b];
    if (!planet) continue;
    // The cycler must be able to reach the planet's radius band [peri, apo].
    const planetPeri = planet.record.a_au * (1 - planet.record.e);
    const planetApo = planet.record.a_au * (1 + planet.record.e);
    if (planetApo < peri - 1e-9 || planetPeri > apo + 1e-9) continue;
    // Minimum-distance point of the cycler ellipse to the planet's real ellipse.
    const planetCurve = samplePlanetEllipse(b, 180);
    let best: Vec2 = { x: 0, y: 0 };
    let bestD = Infinity;
    let bestNu = 0;
    for (let k = 0; k < 360; k++) {
      const nu = (TWO_PI * k) / 360;
      const r = p / (1 + e * Math.cos(nu));
      const u = w + nu;
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);
      const cx = r * (cosO * cosU - sinO * sinU * cosI);
      const cy = r * (sinO * cosU + cosO * sinU * cosI);
      for (const q of planetCurve) {
        const dx = cx - q.x;
        const dy = cy - q.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
          bestNu = nu;
        }
      }
    }
    marks.push({ body: b, pos: best, nu: bestNu });
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
