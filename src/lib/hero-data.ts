// Front-page hero data layer (task #227, spec
// docs/superpowers/specs/2026-06-13-front-page-orbit-viz-design.md §1).
//
// Build-time filter of the catalogue on validation level V1+ ("independently
// reproduced": recorded mechanical test evidence above the V0 literature
// floor), grouped by system (the row's `primary`) into the hero's scenes.
// The hero count comes from THIS filter — nothing hard-codes it.
//
// Per-row render plan (the honesty core): a row only ever gets the geometry
// its own data supports —
//   kepler-ellipse  single-ellipse row with sourced (a, e)
//   aphelion-ring   multi-arc row with a sourced max-aphelion (no per-arc
//                   conics published — ring only, never a fabricated curve)
//   cr3bp           non-keplerian row with a complete CR3BP tuple
//                   (mu, state_nd, period_nd) — propagated in the rotating
//                   frame from the row's own data
//   badge           anything else: named + counted, NO curve drawn
// Each plan carries its own fidelity string for the per-curve caption.

import type { CyclerEntry } from "./types";
import { loadCatalogue } from "./catalogue";

/** Validation levels counted as "independently reproduced" (above the V0
 *  literature floor). V4/V5 are included so future rows lift in automatically. */
const REPRODUCED_LEVELS = new Set(["V1", "V2", "V3", "V4", "V5"]);

export function reproducedEntries(): CyclerEntry[] {
  return loadCatalogue().filter((e) => REPRODUCED_LEVELS.has(e.validation_level ?? "V0"));
}

/** The live hero count. */
export function reproducedCount(): number {
  return reproducedEntries().length;
}

/**
 * The system a row's curve/camera should be drawn in. Reads the explicit
 * `primary` field when present; otherwise falls back to a data-derived
 * heuristic — currently only Uranus needs one. The six 2026-07 Uranian
 * symmetric-closure quasi-cycler rows (#312 family, upstream #558->#569,
 * catalogue commit 8efabd5) were written WITHOUT a `primary: Uranus` field —
 * a deliberate omission upstream (adding it broke an unrelated test pin) —
 * so `primary` alone would silently default them to "Sun" (heliocentric).
 * `bodies` is not optional and IS always present: verified against the
 * synced catalogue that exactly six rows carry "Uranus" in `bodies`, all six
 * of them these Uranian rows and none of them carrying a conflicting
 * explicit `primary`. Use this helper everywhere a row's system is decided —
 * never re-read `entry.primary` directly (that reintroduces the bug).
 */
export function effectivePrimary(entry: CyclerEntry): string {
  if (entry.primary) return entry.primary;
  if (entry.bodies.includes("Uranus")) return "Uranus";
  return "Sun";
}

export interface HeroGroups {
  /** primary Sun (or absent): heliocentric scene. */
  heliocentric: CyclerEntry[];
  /** primary Earth: Earth-Moon rotating-frame scene. */
  earthMoon: CyclerEntry[];
  /** primary Jupiter: Jovian-moons scene. */
  jovian: CyclerEntry[];
  /** effective primary Uranus: Uranian moon-pair quasi-cycler scene. */
  uranian: CyclerEntry[];
  /** any other primary: generic badge scene (never silently dropped). */
  other: CyclerEntry[];
}

export function heroGroups(): HeroGroups {
  const groups: HeroGroups = { heliocentric: [], earthMoon: [], jovian: [], uranian: [], other: [] };
  for (const e of reproducedEntries()) {
    const primary = effectivePrimary(e);
    if (primary === "Sun") groups.heliocentric.push(e);
    else if (primary === "Earth") groups.earthMoon.push(e);
    else if (primary === "Jupiter") groups.jovian.push(e);
    else if (primary === "Uranus") groups.uranian.push(e);
    else groups.other.push(e);
  }
  return groups;
}

// --- per-row render plan -----------------------------------------------------

export type CurvePlan =
  | {
      kind: "kepler-ellipse";
      aAu: number;
      e: number;
      inclinationDeg: number;
      lanDeg: number;
      argpDeg: number;
      fidelity: string;
    }
  | { kind: "aphelion-ring"; radiusAu: number; fidelity: string }
  | {
      kind: "cr3bp";
      mu: number;
      stateNd: number[];
      periodNd: number;
      tunitS: number | null;
      fidelity: string;
    }
  | { kind: "badge"; reason: string };

/**
 * Decide what geometry a row's data honestly supports. Never invents: a row
 * that can't be drawn from its own fields becomes a badge with the reason.
 */
export function curvePlanFor(entry: CyclerEntry): CurvePlan {
  const cls = entry.cycler_class ?? "single-ellipse";
  // orbit_elements optional (four-class scope + retired-Aldrin (a,e)); default to
  // an empty object so the field guards below fall through to a badge, not a crash.
  const oe = entry.orbit_elements ?? ({} as NonNullable<typeof entry.orbit_elements>);

  if (cls === "non-keplerian") {
    const cr = oe.cr3bp;
    if (
      cr &&
      cr.mass_ratio != null &&
      cr.period_nd != null &&
      Array.isArray(cr.state_nd) &&
      cr.state_nd.length === 6
    ) {
      return {
        kind: "cr3bp",
        mu: cr.mass_ratio,
        stateNd: cr.state_nd,
        periodNd: cr.period_nd,
        tunitS: cr.tunit_s ?? null,
        fidelity:
          "PCR3BP rotating-frame propagation from the row's catalogue (μ, state_nd, T); state_nd derived upstream from the sourced (μ, C) — publication gap recorded in the row",
      };
    }
    return { kind: "badge", reason: "CR3BP identity incomplete — no curve drawn" };
  }

  if (cls === "single-ellipse" && oe.a_au != null && oe.e != null) {
    const hasOrient = oe.raan_deg != null || oe.arg_periapsis_deg != null || (oe.inclination_deg != null && oe.inclination_deg !== 0);
    return {
      kind: "kepler-ellipse",
      aAu: oe.a_au,
      e: oe.e,
      inclinationDeg: oe.inclination_deg ?? 0,
      lanDeg: oe.raan_deg ?? 0,
      argpDeg: oe.arg_periapsis_deg ?? 0,
      fidelity: hasOrient 
        ? "sourced (a, e); orientation from published angles (i/Ω/ω)" 
        : "sourced (a, e); coplanar-idealized orientation (no Ω/ω published)",
    };
  }

  if (cls === "multi-arc" && oe.aphelion_au != null) {
    return {
      kind: "aphelion-ring",
      radiusAu: oe.aphelion_au,
      fidelity: "sourced max-aphelion ring only — per-arc conics unpublished, no full curve drawn",
    };
  }

  return {
    kind: "badge",
    reason:
      cls === "multi-arc"
        ? "multi-arc row without published per-arc elements or aphelion — no curve drawn"
        : "no published orbit geometry — no curve drawn",
  };
}
