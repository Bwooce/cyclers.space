// Hero scene specs (task #227, spec §1-2): the JSON-serialisable description
// of the three front-page scenes, built ONCE at build time from the V1+
// filter (hero-data.ts) and consumed by BOTH renderers — the build-time SVG
// poster (poster-svg.ts) and the lazily-loaded 3D gallery (three-gallery.ts).
// One data source, two renderers, mirroring the clockConfig pattern.
//
// The spec carries curve GENERATOR PARAMETERS (Kepler elements, ring radii,
// CR3BP tuples — a few KB), never sampled polylines: each consumer
// regenerates the geometry through the shared pure modules (kepler-time,
// cr3bp-propagate), so the inline JSON island stays tiny and the front page
// ships zero geometry bytes it doesn't need.
//
// Honesty: every curve carries its own fidelity string (per-curve caption,
// the 3c79bd9 binding); rows whose data supports no curve are badges — named
// and counted, never drawn. Caption lines are COMPUTED from the data (counts,
// a/e values, period ranges), so they can never drift from what is rendered.

import type { CyclerEntry } from "./types";
import type { KeplerElements } from "./kepler-time";
import { planetToElements, periodDays } from "./kepler-time";
import { PLANETS, PLANET_GEOMETRY_CITATION } from "./orbit";
import { fmtVinfMultiset } from "./catalogue";
import { heroGroups, curvePlanFor, reproducedCount } from "./hero-data";

export interface SceneCurveSpec {
  id: string;
  label: string;
  tier: string; // V1..V5
  fidelity: string;
  geom:
    | { kind: "kepler-ellipse"; el: KeplerElements }
    | { kind: "ring"; radiusAu: number }
    | { kind: "cr3bp"; mu: number; stateNd: number[]; periodNd: number; periodDays: number | null };
}

export interface SceneBodySpec {
  name: string;
  kind: "star" | "planet" | "moon";
  /** Fixed scene position (rotating-frame bodies). */
  fixed?: { x: number; y: number };
  /** Kepler elements on the day clock (moving bodies, heliocentric scene). */
  el?: KeplerElements;
}

export interface SceneBadgeSpec {
  id: string;
  label: string;
  tier: string;
  detail: string;
}

export interface HeroSceneSpec {
  id: "heliocentric" | "earth-moon" | "jovian" | "other";
  title: string;
  /** Frame + units honesty line, always first in the caption. */
  frameLabel: string;
  curves: SceneCurveSpec[];
  bodies: SceneBodySpec[];
  badges: SceneBadgeSpec[];
  captionLines: string[];
  /** Rows of the V1+ filter represented by this scene (curves + badges). */
  rowCount: number;
}

const tierOf = (e: CyclerEntry): string => e.validation_level ?? "V0";

/** Short legend label: CR3BP rows use their family name; others get the row
 *  name clipped at the first parenthetical/em-dash qualifier. */
function labelOf(e: CyclerEntry): string {
  const fam = e.orbit_elements?.cr3bp?.family;
  if ((e.cycler_class ?? "single-ellipse") === "non-keplerian" && fam) return fam;
  const name = e.name;
  const cut = Math.min(
    ...[name.indexOf(" ("), name.indexOf(" —"), name.length].filter((i) => i >= 0),
  );
  const short = name.slice(0, cut);
  return short.length > 48 ? `${short.slice(0, 45)}…` : short;
}

/** Tally a list as "V3 ×2, V1 ×14" (descending tier). */
function tierTally(entries: CyclerEntry[]): string {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(tierOf(e), (counts.get(tierOf(e)) ?? 0) + 1);
  return ["V5", "V4", "V3", "V2", "V1"]
    .filter((t) => counts.has(t))
    .map((t) => `${t} ×${counts.get(t)}`)
    .join(", ");
}

function heliocentricScene(entries: CyclerEntry[]): HeroSceneSpec {
  const curves: SceneCurveSpec[] = [];
  const badges: SceneBadgeSpec[] = [];
  const ellipseRows: CyclerEntry[] = [];
  const ringRows: CyclerEntry[] = [];

  for (const e of entries) {
    const plan = curvePlanFor(e);
    if (plan.kind === "kepler-ellipse") {
      ellipseRows.push(e);
      curves.push({
        id: e.id,
        label: labelOf(e),
        tier: tierOf(e),
        fidelity: plan.fidelity,
        geom: {
          kind: "kepler-ellipse",
          el: {
            a: plan.aAu,
            e: plan.e,
            i_deg: plan.inclinationDeg,
            lan_deg: plan.lanDeg,
            argp_deg: plan.argpDeg,
            M0_deg: 0,
            t_epoch_day: 0,
          },
        },
      });
    } else if (plan.kind === "aphelion-ring") {
      ringRows.push(e);
      curves.push({
        id: e.id,
        label: labelOf(e),
        tier: tierOf(e),
        fidelity: plan.fidelity,
        geom: { kind: "ring", radiusAu: plan.radiusAu },
      });
    } else {
      badges.push({
        id: e.id,
        label: labelOf(e),
        tier: tierOf(e),
        detail: plan.kind === "badge" ? plan.reason : "",
      });
    }
  }

  // Planets: the union of encountered known planets across the scene's rows,
  // plus Earth — same rule as the detail pages, from the synced Standish set.
  const planetCodes = Array.from(
    new Set<string>(["E", ...entries.flatMap((e) => e.bodies).filter((b) => PLANETS[b])]),
  );
  const bodies: SceneBodySpec[] = [
    { name: "Sun", kind: "star", fixed: { x: 0, y: 0 } },
    ...planetCodes.map((c) => ({
      name: PLANETS[c]!.name,
      kind: "planet" as const,
      el: planetToElements(PLANETS[c]!.record),
    })),
  ];

  const captionLines: string[] = ["Heliocentric ecliptic (J2000 idealization); units AU."];
  // Group identical published shapes so a shared (a,e) is stated, not hidden.
  if (ellipseRows.length > 0) {
    const shapes = new Map<string, CyclerEntry[]>();
    for (const e of ellipseRows) {
      const plan = curvePlanFor(e);
      if (plan.kind !== "kepler-ellipse") continue;
      const k = `${plan.aAu}|${plan.e}|${plan.inclinationDeg}|${plan.lanDeg}|${plan.argpDeg}`;
      shapes.set(k, [...(shapes.get(k) ?? []), e]);
    }
    for (const [k, rows] of shapes) {
      const [a, ecc, inc, lan, argp] = k.split("|");
      const who = rows.map((r) => `${labelOf(r)} (${tierOf(r)})`).join(" + ");
      const isCoplanar = Number(inc) === 0 && Number(lan) === 0 && Number(argp) === 0;
      captionLines.push(
        rows.length > 1
          ? `${who}: sourced (a, e) = (${a}, ${ecc}) AU, ${isCoplanar ? "coplanar-idealized" : "with orientation"} — the rows publish the same geometry, so their curves coincide.`
          : `${who}: sourced (a, e) = (${a}, ${ecc}) AU, ${isCoplanar ? "coplanar-idealized (no Ω/ω published)" : "orientation from published angles (i/Ω/ω)"}.`,
      );
    }
  }
  if (ringRows.length > 0) {
    captionLines.push(
      `${ringRows.length} Russell-family multi-arc rows (${tierTally(ringRows)}): sourced max-aphelion rings only — per-arc conics unpublished, no full curves drawn.`,
    );
  }
  captionLines.push(`Planets: Standish J2000 osculating ellipses — ${PLANET_GEOMETRY_CITATION}.`);
  captionLines.push("Clock: idealized phase (no epoch) — encounter timing not asserted.");

  return {
    id: "heliocentric",
    title: "Heliocentric Earth–Mars cyclers",
    frameLabel: "heliocentric ecliptic, AU",
    curves,
    bodies,
    badges,
    captionLines,
    rowCount: entries.length,
  };
}

function earthMoonScene(entries: CyclerEntry[]): HeroSceneSpec {
  const curves: SceneCurveSpec[] = [];
  const badges: SceneBadgeSpec[] = [];
  let mu: number | null = null;
  const periodsD: number[] = [];

  for (const e of entries) {
    const plan = curvePlanFor(e);
    if (plan.kind === "cr3bp") {
      mu = mu ?? plan.mu;
      const pDays = plan.tunitS != null ? (plan.periodNd * plan.tunitS) / 86400 : null;
      if (pDays != null) periodsD.push(pDays);
      curves.push({
        id: e.id,
        label: labelOf(e),
        tier: tierOf(e),
        fidelity: plan.fidelity,
        geom: { kind: "cr3bp", mu: plan.mu, stateNd: plan.stateNd, periodNd: plan.periodNd, periodDays: pDays },
      });
    } else {
      badges.push({
        id: e.id,
        label: labelOf(e),
        tier: tierOf(e),
        detail: plan.kind === "badge" ? plan.reason : "",
      });
    }
  }

  const bodies: SceneBodySpec[] =
    mu != null
      ? [
          { name: "Earth", kind: "planet", fixed: { x: -mu, y: 0 } },
          { name: "Moon", kind: "moon", fixed: { x: 1 - mu, y: 0 } },
        ]
      : [];

  const captionLines: string[] = [
    `Earth–Moon rotating frame (planar CR3BP${mu != null ? `, μ = ${mu.toFixed(7)}` : ""}); unit = Earth–Moon distance.`,
    "Curves: propagated from each row's catalogue (μ, state_nd, T). state_nd is derived upstream from the sourced (μ, C) — a recorded publication gap, not a published trajectory.",
  ];
  if (periodsD.length > 0) {
    const lo = Math.min(...periodsD).toFixed(1);
    const hi = Math.max(...periodsD).toFixed(1);
    captionLines.push(`Markers: time-true in the rotating frame (sourced periods ${lo}–${hi} d).`);
  }

  return {
    id: "earth-moon",
    title: "Earth–Moon CR3BP cyclers",
    frameLabel: "Earth–Moon rotating frame, distance = 1",
    curves,
    bodies,
    badges,
    captionLines,
    rowCount: entries.length,
  };
}

function jovianScene(entries: CyclerEntry[]): HeroSceneSpec {
  // The Liang rows publish V-inf multisets, transit times and the flyby
  // sequence — but neither the moon orbit radii nor per-arc conic elements.
  // Reconstructing the idealized picture would need external constants plus
  // re-derivation, so per the approved design these rows are badges: named
  // and counted, no curve drawn.
  const badges: SceneBadgeSpec[] = entries.map((e) => ({
    id: e.id,
    label: labelOf(e),
    tier: tierOf(e),
    detail: `${e.sequence_canonical} — V∞ ${fmtVinfMultiset(e.vinf_kms_at_encounters)} km/s`,
  }));
  return {
    id: "jovian",
    title: "Jovian-moon triple cyclers",
    frameLabel: "Jovicentric (badges only — no curve drawn)",
    curves: [],
    bodies: [],
    badges,
    captionLines: [
      "Jovicentric multi-rev conic arcs (idealized circular-coplanar model).",
      "The catalogue's invariants (V∞ multiset, transit times, sequence) do not fix the arc geometry — no curve is drawn for these rows.",
    ],
    rowCount: entries.length,
  };
}

/** Generic badge scene for any V1+ row whose primary is none of the three
 *  known systems — the filter's rows are NEVER silently dropped. */
function otherScene(entries: CyclerEntry[]): HeroSceneSpec {
  return {
    id: "other",
    title: "Other systems",
    frameLabel: "system not yet rendered (badges only)",
    curves: [],
    bodies: [],
    badges: entries.map((e) => ({
      id: e.id,
      label: labelOf(e),
      tier: tierOf(e),
      detail: e.sequence_canonical,
    })),
    captionLines: ["No scene renderer for this system yet — rows are named and counted, no curve drawn."],
    rowCount: entries.length,
  };
}

/** The hero's scenes, in display order. Scenes for empty groups are omitted;
 *  the sum of rowCount always equals reproducedCount(). */
export function buildHeroScenes(): HeroSceneSpec[] {
  const g = heroGroups();
  const scenes: HeroSceneSpec[] = [];
  if (g.heliocentric.length > 0) scenes.push(heliocentricScene(g.heliocentric));
  if (g.earthMoon.length > 0) scenes.push(earthMoonScene(g.earthMoon));
  if (g.jovian.length > 0) scenes.push(jovianScene(g.jovian));
  if (g.other.length > 0) scenes.push(otherScene(g.other));
  return scenes;
}

/** Convenience for consumers that need the count alongside the scenes. */
export function heroSummary(): { count: number; scenes: HeroSceneSpec[] } {
  return { count: reproducedCount(), scenes: buildHeroScenes() };
}

/** Period of a hero Kepler curve in days (for time-true animation). */
export function curvePeriodDays(el: KeplerElements): number {
  return periodDays(el);
}
