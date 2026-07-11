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
import {
  URANUS_MU_KM3S2,
  URANUS_MOONS,
  URANUS_MOON_CITATION,
  orderedMoonPairs,
  meanMotionDegPerDayAbout,
  hohmannElements,
  azimuthForPairIndex,
} from "./uranus-scene";

export interface SceneCurveSpec {
  id: string;
  label: string;
  tier: string; // V1..V5
  fidelity: string;
  geom:
    | { kind: "kepler-ellipse"; el: KeplerElements }
    | { kind: "ring"; radiusAu: number }
    | { kind: "cr3bp"; mu: number; stateNd: number[]; periodNd: number; periodDays: number | null }
    | {
        kind: "uranian-transfer";
        moonA: string;
        moonB: string;
        smaAKm: number;
        smaBKm: number;
        aKm: number;
        e: number;
        azimuthDeg: number;
      };
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
  id:
    | "heliocentric"
    | "earth-moon-landmark"
    | "earth-moon-ross-rt"
    | "earth-moon-braik-ross"
    | "jovian"
    | "uranian"
    | "other";
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

type EarthMoonGroup = "landmark" | "ross-rt" | "braik-ross";

/**
 * Partition Earth-Moon CR3BP rows into three sub-scenes (2026-07 follow-up
 * to #227): the single 9-curve panel overlaid every rotating-frame shape at
 * once — a classic figure-8, a 3-petal cycler, and the whole Ross-RT/
 * Braik-Ross resonant-family sweep — which read as visual noise rather than
 * distinct orbits. Split by the row's own `id` naming convention (a stable
 * upstream identifier, more robust than parsing the free-text `family`
 * string): `braik-ross-*` is its own family; `ross-rt-em-cycler-*` plus the
 * one 3D out-of-plane spatial extension of that family form the Ross-RT
 * group; everything else (the historically-named Arenstorf figure-8, the
 * Genova-Aldrin 3-petal, and any future Earth-Moon row that doesn't yet fit
 * either family) falls into the "landmark/other" catch-all bucket — never a
 * silent drop, matching the `otherScene` rule elsewhere in this file.
 */
function earthMoonGroupOf(e: CyclerEntry): EarthMoonGroup {
  if (e.id.startsWith("braik-ross-")) return "braik-ross";
  if (e.id.startsWith("ross-rt-em-cycler-") || e.id === "em-cycler-21-3d-spatial-2026") return "ross-rt";
  return "landmark";
}

/** Shared Earth-Moon CR3BP sub-scene builder: identical geometry/caption
 *  logic for all three family-grouped panels, parameterised only by id/title
 *  and the (already-partitioned) row list. */
function earthMoonSubScene(entries: CyclerEntry[], id: HeroSceneSpec["id"], title: string): HeroSceneSpec {
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
  // Cusp explainer (direct user question: "how can the orbits fall back like
  // that without going around an object?"). A rotating-frame plot subtracts
  // the frame's own rotation from the true (smooth) inertial motion, so a
  // sharp reversal is a frame artifact where the two rates momentarily
  // match — exactly the mechanism behind Mars's apparent retrograde loop as
  // seen from Earth — never evidence of an unmodelled close approach.
  captionLines.push(
    "Why the pointy cusps? Rotating-frame view: sharp reversals are a frame effect (like Mars's apparent retrograde loop seen from Earth), not a collision or close approach — full explanation: /about/#reading-diagrams.",
  );

  return {
    id,
    title,
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

/**
 * Uranian moon-pair quasi-cycler scene (2026-07, #558->#569, catalogue commit
 * 8efabd5): the six V4 representatives of the 30-member #563 symmetric-
 * closure family — one per non-Miranda moon-pair direction (see
 * uranus-scene.ts's module doc for the honesty split between what's sourced
 * (moon radii, V-infinity triplet, synodic timing) and what's an idealized
 * illustrative proxy (the Hohmann-type transfer shape).
 *
 * Uranus-centric, camera down the Uranian pole: this scene's local frame
 * DEFINES the pole as its z-axis and draws every moon coplanar at z=0 (i=0),
 * matching these rows' own recorded circular-coplanar orbit_fidelity — the
 * shared toThree axis swap (three-axis.ts) then puts that local z on world
 * "up" for free, so the 3D camera looks straight down the pole without any
 * real ~98-degree IAU-tilt transform (this is a LOCAL Uranus-equatorial
 * frame, not the ecliptic).
 */
function uranianScene(entries: CyclerEntry[]): HeroSceneSpec {
  const curves: SceneCurveSpec[] = [];
  const badges: SceneBadgeSpec[] = [];
  const pairIndex = new Map(orderedMoonPairs().map((p, i) => [`${p[0]}-${p[1]}`, i]));

  for (const e of entries) {
    const moonA = e.bodies[1];
    const moonB = e.bodies[2];
    const refA = moonA ? URANUS_MOONS[moonA] : undefined;
    const refB = moonB ? URANUS_MOONS[moonB] : undefined;
    if (!refA || !refB) {
      badges.push({
        id: e.id,
        label: labelOf(e),
        tier: tierOf(e),
        detail: "moon pair not resolvable from bodies[] — no curve drawn",
      });
      continue;
    }
    const key = [moonA, moonB].sort((a, b) => URANUS_MOONS[a]!.smaKm - URANUS_MOONS[b]!.smaKm).join("-");
    const idx = pairIndex.get(key) ?? 0;
    const el = hohmannElements(refA.smaKm, refB.smaKm);
    const vw = e.validity_window;
    const vinf = fmtVinfMultiset(e.vinf_kms_at_encounters);
    const duty = vw?.synodic_duty_cycle_pct != null ? `${vw.synodic_duty_cycle_pct}%` : "—";
    const synodic = vw?.synodic_period_days != null ? `${vw.synodic_period_days} d` : "—";
    // Plain-language lead (what pair / how fast / when relevant), THEN the
    // existing technical fidelity/honesty disclosure as a clearly-secondary
    // continuation — a single string field (SceneCurveSpec.fidelity, consumed
    // as-is by both hero-legend.ts and hero-gallery.ts's legend rendering),
    // so this stays one field rather than forcing a two-field type change.
    const startYear = vw?.start ? vw.start.slice(0, 4) : null;
    const endYear = vw?.end ? vw.end.slice(0, 4) : null;
    const recurrence =
      vw?.synodic_period_days != null
        ? `recurs roughly every ${vw.synodic_period_days.toFixed(1)} days`
        : "recurrence timing not published";
    const window =
      vw?.synodic_duty_cycle_pct != null && startYear && endYear
        ? `flyable about ${vw.synodic_duty_cycle_pct}% of each cycle, valid ${startYear}–${endYear}`
        : "validity window not fully published";
    const plainSummary = `A quasi-cyclic transfer between ${moonA} and ${moonB}: ${recurrence}, ${window}.`;
    const technical =
      `Technical detail: idealized 2-body Hohmann-type transfer ellipse between ${moonA} (r=${Math.round(refA.smaKm)} km) ` +
      `and ${moonB} (r=${Math.round(refB.smaKm)} km) real circular orbits (${URANUS_MOON_CITATION}) — ` +
      `a first-order visual proxy, NOT the row's actual computed arc (found via a CR3BP-based symmetric-` +
      `closure search against real URA111 ephemeris). Row's own real invariants: V-inf ${vinf} km/s at ` +
      `each encounter, synodic period ${synodic}, duty cycle ${duty} over ${vw?.start ?? "?"}..${vw?.end ?? "?"}.`;
    curves.push({
      id: e.id,
      label: labelOf(e),
      tier: tierOf(e),
      fidelity: `${plainSummary} ${technical}`,
      geom: {
        kind: "uranian-transfer",
        moonA,
        moonB,
        smaAKm: refA.smaKm,
        smaBKm: refB.smaKm,
        aKm: el.aKm,
        e: el.e,
        azimuthDeg: azimuthForPairIndex(idx),
      },
    });
  }

  const moonNames = Array.from(
    new Set(entries.flatMap((e) => [e.bodies[1], e.bodies[2]]).filter((n): n is string => n != null && URANUS_MOONS[n] != null)),
  );
  const bodies: SceneBodySpec[] = [
    { name: "Uranus", kind: "star", fixed: { x: 0, y: 0 } },
    ...moonNames
      .sort((a, b) => URANUS_MOONS[a]!.smaKm - URANUS_MOONS[b]!.smaKm)
      .map((name) => ({
        name,
        kind: "moon" as const,
        el: {
          a: URANUS_MOONS[name]!.smaKm,
          e: 0,
          i_deg: 0,
          lan_deg: 0,
          argp_deg: 0,
          M0_deg: 0,
          n_deg_per_day: meanMotionDegPerDayAbout(URANUS_MOONS[name]!.smaKm, URANUS_MU_KM3S2),
          t_epoch_day: 0,
        },
      })),
  ];

  const dutyCycles = entries
    .map((e) => e.validity_window?.synodic_duty_cycle_pct)
    .filter((d): d is number => d != null);

  const dutyLo = dutyCycles.length > 0 ? Math.min(...dutyCycles) : null;
  const dutyHi = dutyCycles.length > 0 ? Math.max(...dutyCycles) : null;
  const captionLines: string[] = [
    "Uranus-centric, camera down the Uranian pole (local equatorial frame, moons coplanar); units km.",
    `Moon orbits: real sourced semi-major axes as circles (${URANUS_MOON_CITATION}).`,
    `${curves.length} V4 representatives (1 per moon-pair direction) of the 30-member #563 symmetric-closure family first documented by #312; the other 24 same-pair-redundant closures are not separately catalogued.`,
    "Transfer arcs: idealized 2-body Hohmann-type ellipses between the real moon radii, NOT the row's real arc (found via CR3BP + real URA111 ephemeris). Fan-out azimuth is for visual separation only.",
    dutyLo != null
      ? `Measured synodic duty cycle ${dutyLo}-${dutyHi}% across the six rows; each valid over a bounded 2000-2083 window, not perpetual.`
      : "Each row's synodic duty cycle is measured over a bounded 2000-2083 window, not perpetual.",
  ];

  return {
    id: "uranian",
    title: "Uranian moon-pair quasi-cyclers",
    frameLabel: "Uranus-centric equatorial (polar-down camera), km",
    curves,
    bodies,
    badges,
    captionLines,
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
 *  the sum of rowCount always equals reproducedCount().
 *
 * The Uranian scene leads (promoted 2026-07): it is the catalogue's only
 * literature-novel confirmed discovery (#312 and its #563 family), so it is
 * the site's strongest story — first in the poster and the first slide the
 * 3D gallery opens on. Every downstream consumer looks scenes up by `.id`
 * (never by array position), so this ordering carries no functional risk. */
export function buildHeroScenes(): HeroSceneSpec[] {
  const g = heroGroups();
  const scenes: HeroSceneSpec[] = [];
  if (g.uranian.length > 0) scenes.push(uranianScene(g.uranian));
  if (g.heliocentric.length > 0) scenes.push(heliocentricScene(g.heliocentric));
  // Earth-Moon: split into three family-grouped panels (2026-07 follow-up to
  // #227 — see earthMoonGroupOf's doc comment). Each sub-scene is omitted
  // when empty, same convention as every other scene here; today's V1+ data
  // populates only ross-rt (6 rows) and braik-ross (3 rows) — the landmark
  // bucket (Arenstorf figure-8, Genova-Aldrin 3-petal) is V0-only right now,
  // so it renders nothing until one of those rows is promoted off V0.
  const landmark = g.earthMoon.filter((e) => earthMoonGroupOf(e) === "landmark");
  const rossRt = g.earthMoon.filter((e) => earthMoonGroupOf(e) === "ross-rt");
  const braikRoss = g.earthMoon.filter((e) => earthMoonGroupOf(e) === "braik-ross");
  if (landmark.length > 0) {
    scenes.push(earthMoonSubScene(landmark, "earth-moon-landmark", "Earth–Moon: landmark cyclers"));
  }
  if (rossRt.length > 0) {
    scenes.push(earthMoonSubScene(rossRt, "earth-moon-ross-rt", "Earth–Moon: Ross-RT resonant family"));
  }
  if (braikRoss.length > 0) {
    scenes.push(earthMoonSubScene(braikRoss, "earth-moon-braik-ross", "Earth–Moon: Braik-Ross cyclers"));
  }
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
