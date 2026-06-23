import yaml from "js-yaml";
import type { Citation, CyclerEntry, Leg, OrbitClass, ValidityWindow } from "./types";
import windowsData from "../data/windows.json";
// Vite raw-import: at build time the YAML file's contents are inlined as a
// string into the bundle. This is robust against Astro's prerender file
// layout (no filesystem reads at runtime) and works in both dev and
// production builds.
// src/data/catalogue.yaml is NOT committed — it is fetched from the single
// source of truth (Bwooce/cyclers) by the `prebuild`/`predev` sync step
// (scripts/sync-catalogue.mjs). This repo keeps no duplicate of the catalogue.
import rawYaml from "../data/catalogue.yaml?raw";

let cache: CyclerEntry[] | null = null;

export function loadCatalogue(): CyclerEntry[] {
  if (cache) return cache;
  const parsed = yaml.load(rawYaml) as CyclerEntry[];
  // Read the validation level straight from the catalogue (schema v4.5,
  // spec §16.7.12): it is now back-filled mechanically upstream from recorded
  // test evidence. An absent tag is the explicit V0 internal-consistency floor,
  // so default to V0 when a row carries no validation_level.
  cache = parsed.map((entry) => {
    // Schema v5 (2026-06-15): four-class taxonomy. Rows that pre-date the
    // upstream migration carry no `orbit_class`; they default to "cycler" — the
    // original scope — and `epoch_locked` follows from the class. The site
    // continues to work unchanged while the schema-migration PR is in flight.
    const orbit_class: OrbitClass = entry.orbit_class ?? "cycler";
    const epoch_locked = entry.epoch_locked ?? orbit_class !== "cycler";
    const n_returns =
      entry.n_returns ?? (orbit_class === "cycler" ? ("infinite" as const) : entry.n_returns);
    return {
      ...entry,
      validation_level: entry.validation_level ?? ("V0" as const),
      orbit_class,
      epoch_locked,
      n_returns,
      // Boundary normalisation (2026-06-22): array fields that are OPTIONAL in the
      // schema (mga_tour / precursor rows may omit them) are coerced to [] here so
      // no downstream render code can hit `.length`/`.map` on undefined. Normalising
      // once at the loader is the durable fix; per-call-site guards are fragile (a
      // missing one crashes `astro build` opaquely). See catalogue-real-shape.test.ts.
      vinf_kms_at_encounters: entry.vinf_kms_at_encounters ?? [],
      // Schema v4.9 (upstream #427, M7): per-node flyby altitudes — optional, present
      // only for rows with a reproduced M7 trajectory. Coerce to [] so the render
      // never hits `.length`/`.map` on undefined.
      flyby_altitudes_km: entry.flyby_altitudes_km ?? [],
      // `first_published` is typed required (Citation) but a handful of synced
      // four-class rows (mga_tour / precursor) omit it — a type/data mismatch that
      // crashes the Source column. Default to an empty citation so the templates'
      // existing `authors[0] ?? "?"` fallbacks render "?" instead of throwing.
      first_published:
        entry.first_published ?? ({ authors: [], year: 0, title: "", venue: "" } as Citation),
    };
  });
  return cache;
}

/**
 * Read the orbit class, applying the schema-v5 default. Use this rather than
 * `entry.orbit_class` directly so call sites stay consistent during the upstream
 * migration window when many rows still carry no explicit class.
 */
export function effectiveOrbitClass(entry: CyclerEntry): OrbitClass {
  return entry.orbit_class ?? "cycler";
}

/** Human-readable label for each of the four orbit classes. */
export const ORBIT_CLASS_LABEL: Record<OrbitClass, string> = {
  cycler: "Cycler",
  quasi_cycler: "Quasi-cycler",
  precursor_mga: "Precursor",
  mga_tour: "Tour",
};

/** Long-form label used in tooltips and the detail page. */
export const ORBIT_CLASS_LONG_LABEL: Record<OrbitClass, string> = {
  cycler: "strict cycler (infinite returns)",
  quasi_cycler: "quasi-cycler (epoch-locked, finite returns)",
  precursor_mga: "precursor MGA (one-shot insertion into a cycler)",
  mga_tour: "MGA tour (one-shot terminal arrival)",
};

/**
 * Format a validity window for the catalogue table — compact `YYYY-MM-DD →
 * YYYY-MM-DD`. Returns null when the input is missing so callers can omit the
 * cell content rather than rendering "—".
 */
export function formatValidityWindow(w: ValidityWindow | null | undefined): string | null {
  if (!w || !w.start || !w.end) return null;
  return `${w.start.slice(0, 10)} → ${w.end.slice(0, 10)}`;
}

/**
 * Schema-v5 epoch-window filter: classify a validity window relative to `now`.
 * `open-now` means now is between start and end (inclusive); `past` means end is
 * before now; `future` means start is after now. Rows without a window match
 * the `all` filter only — they fall out of past/future/open-now buckets.
 */
export type EpochWindowFilter = "all" | "open-now" | "past" | "future";

export function classifyValidityWindow(
  w: ValidityWindow | null | undefined,
  nowIso: string,
): "open-now" | "past" | "future" | "unknown" {
  if (!w || !w.start || !w.end) return "unknown";
  // ISO strings sort lexicographically when zero-padded — true for ISO-8601
  // YYYY-MM-DD or full timestamps, which is what the schema requires.
  if (nowIso < w.start) return "future";
  if (nowIso > w.end) return "past";
  return "open-now";
}

export function inEpochWindow(
  entry: CyclerEntry,
  filter: EpochWindowFilter,
  nowIso: string,
): boolean {
  if (filter === "all") return true;
  // Cyclers have no window — they pass `all` only.
  if (effectiveOrbitClass(entry) === "cycler") return false;
  const cls = classifyValidityWindow(entry.validity_window, nowIso);
  if (cls === "unknown") return false;
  return cls === filter;
}

/**
 * Schema-v5 n_returns filter. "infinite" passes any min, fails any explicit
 * max. Absent values fail both bounds (be honest about missing data). Cyclers
 * are infinite by definition and pass `all` only — set min/max to null to
 * disable the filter.
 */
export function nReturnsValue(entry: CyclerEntry): number | "infinite" | null {
  const v = entry.n_returns;
  if (v === undefined || v === null) {
    return effectiveOrbitClass(entry) === "cycler" ? "infinite" : null;
  }
  return v;
}

export function inNReturnsRange(
  entry: CyclerEntry,
  min: number | null,
  max: number | null,
): boolean {
  if (min === null && max === null) return true;
  const v = nReturnsValue(entry);
  if (v === null) return false;
  if (v === "infinite") {
    // Infinite ≥ any min, infinite ≤ no finite max.
    return max === null;
  }
  if (min !== null && v < min) return false;
  if (max !== null && v > max) return false;
  return true;
}

export function getEntryById(id: string): CyclerEntry | undefined {
  return loadCatalogue().find((e) => e.id === id);
}

/**
 * Real-ephemeris encounter windows for a row, from the synced windows.json
 * (DE440 geometric-match dates; see windows.json header). Used by the orbit
 * view to prefer real DE440 dates over idealized geometry (design Q3). Returns
 * the body order + chronologically-sorted match dates, or null when the row
 * produced no windows (skipped / non-ballistic / non-heliocentric).
 */
export interface WindowMatch {
  iso: string;
  vinf: number[];
}
export function encounterWindowsFor(id: string): { bodies: string[]; matches: WindowMatch[] } | null {
  const entry = (windowsData as { entries: Array<Record<string, unknown>> }).entries.find((e) => e.id === id);
  if (!entry) return null;
  const dates = (entry.next_encounters_iso as string[]) ?? [];
  if (dates.length === 0) return null;
  const vinfs = (entry.vinf_actual_kms as number[][]) ?? [];
  const matches = dates
    .map((iso, i) => ({ iso, vinf: vinfs[i] ?? [] }))
    .sort((a, b) => a.iso.localeCompare(b.iso));
  return { bodies: (entry.bodies as string[]) ?? [], matches };
}

/**
 * The lowest-mismatch DE440 window for a row (design Q5: the most physically
 * meaningful anchor for t=0 in the time-true viz). windows.json stores the
 * per-window mismatch_kms parallel to next_encounters_iso; we pair them and
 * return the minimum, NOT the chronologically-first (which encounterWindowsFor
 * sorts to). Returns null when the row has no windows.
 */
export interface AnchorWindow {
  iso: string;
  mismatch: number;
  vinf: number[];
}
export function lowestMismatchWindow(id: string): AnchorWindow | null {
  const entry = (windowsData as { entries: Array<Record<string, unknown>> }).entries.find((e) => e.id === id);
  if (!entry) return null;
  const dates = (entry.next_encounters_iso as string[]) ?? [];
  if (dates.length === 0) return null;
  const mism = (entry.mismatch_kms as number[]) ?? [];
  const vinfs = (entry.vinf_actual_kms as number[][]) ?? [];
  let best: AnchorWindow | null = null;
  for (let i = 0; i < dates.length; i++) {
    const m = mism[i] ?? Infinity;
    if (best === null || m < best.mismatch) {
      best = { iso: dates[i]!, mismatch: m, vinf: vinfs[i] ?? [] };
    }
  }
  return best;
}

/**
 * Resolve a list of supersession target ids (schema v4.3, spec §16.7.10) to
 * {id, name} pairs for linking. Ids that don't resolve to an existing row are
 * passed through with name === id so the link text is still informative (the
 * upstream Python gate guarantees resolution, this is defensive).
 */
export function resolveLinks(ids: readonly string[] | null | undefined): { id: string; name: string }[] {
  if (!ids || ids.length === 0) return [];
  return ids.map((id) => {
    const target = getEntryById(id);
    return { id, name: target?.name ?? id };
  });
}

/**
 * Tally the catalogue's validation levels (V0..V5), reading the back-filled
 * level from each row (absent ⇒ V0 floor). Drives the data-driven validation
 * prose on the home and about pages so the site never hard-codes "every entry
 * is V0".
 */
export function validationLevelCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of loadCatalogue()) {
    const level = entry.validation_level ?? "V0";
    counts[level] = (counts[level] ?? 0) + 1;
  }
  return counts;
}

/**
 * Schema-v3 leg source: prefer trajectory.segments, fall back to legacy legs[].
 * Mirrors cyclerfinder.data.catalog._segments_as_legs. Segments reuse the
 * tof_days / n_revs keys, so consumers get a uniform Leg[] either way.
 */
export function legsOf(entry: CyclerEntry): Leg[] {
  const segs = entry.trajectory?.segments;
  if (segs && segs.length > 0) {
    return segs.map((s) => ({
      from: s.from,
      to: s.to,
      tof_days: s.tof_days,
      n_revs: s.n_revs ?? 0,
      note: s.note,
    }));
  }
  return entry.legs ?? [];
}

/**
 * Derived progress flag mirroring CyclerEntry.fully_defined in the upstream
 * library (spec §16.6.4 / §16.7.5): the orbit is completely specified — all
 * core fields present AND no acknowledged known-unknown (data_gaps[]).
 *
 * Dispatches by cycler_class (spec §16.7.5):
 * - single-ellipse: a/e + V∞ + legs present.
 * - multi-arc:      invariants block present with at least one non-null value +
 *                   V∞ + legs present (no a/e check — no single conic).
 * - non-keplerian:  cr3bp identity triple (jacobi_constant/period_nd/
 *                   stability_index) all non-null; V∞/legs guard not applied.
 */
export function isFullyDefined(entry: CyclerEntry): boolean {
  if (entry.data_gaps && entry.data_gaps.length > 0) return false;
  const cls = entry.cycler_class ?? "single-ellipse";

  if (cls === "non-keplerian") {
    const cr = entry.orbit_elements?.cr3bp;
    if (!cr) return false;
    return (
      cr.jacobi_constant !== null &&
      cr.jacobi_constant !== undefined &&
      cr.period_nd !== null &&
      cr.period_nd !== undefined &&
      cr.stability_index !== null &&
      cr.stability_index !== undefined
    );
  }

  let coreOk: boolean;
  if (cls === "multi-arc") {
    const inv = entry.invariants;
    coreOk =
      inv != null &&
      (inv.aphelion_ratio !== null ||
        inv.turn_ratio !== null ||
        (inv.transit_times_days !== null && (inv.transit_times_days?.length ?? 0) > 0));
  } else {
    // single-ellipse
    const oe = entry.orbit_elements;
    coreOk = oe != null && oe.a_au !== null && oe.a_au !== undefined && oe.e !== null && oe.e !== undefined;
  }
  if (!coreOk) return false;

  // `vinf_kms_at_encounters` is optional since the four-class scope (schema v5):
  // mga_tour / precursor rows may omit it. Guard the access — an undefined field
  // here is "not fully defined", not a render-time crash.
  const vinfs = entry.vinf_kms_at_encounters;
  if (!vinfs || !vinfs.length || vinfs.some((v) => v.vinf_kms === null)) return false;
  const legs = legsOf(entry);
  if (!legs || !legs.length || legs.some((l) => l.tof_days === null)) return false;
  return true;
}

/**
 * Pretty-format a number for the catalogue table. Returns "—" for null/undefined
 * so the UI is honest about missing values per spec §16.1's nullability rules.
 */
export function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(digits);
}

/**
 * Join a body list into the human-readable encounter set, e.g. ["V","E","M"] → "V-E-M".
 */
export function fmtBodies(bodies: readonly string[]): string {
  return bodies.join("-");
}

/**
 * Format the per-class orbital identity column (spec §16.7.5).
 *
 * single-ellipse → "a=X.XX, e=Y.YYY"
 * multi-arc      → aphelion_ratio if present, else transit times
 * non-keplerian  → Jacobi / period_nd / stability summary, or family name
 */
export function fmtIdentity(entry: CyclerEntry): string {
  const cls = entry.cycler_class ?? "single-ellipse";
  if (cls === "single-ellipse") {
    const a = entry.orbit_elements?.a_au;
    const e = entry.orbit_elements?.e;
    if (a === null || a === undefined || e === null || e === undefined) return "—";
    return `a=${a.toFixed(2)} AU, e=${e.toFixed(3)}`;
  }
  if (cls === "multi-arc") {
    const inv = entry.invariants;
    if (!inv) return "—";
    const parts: string[] = [];
    if (inv.aphelion_ratio !== null && inv.aphelion_ratio !== undefined)
      parts.push(`AR=${inv.aphelion_ratio.toFixed(2)}`);
    if (inv.turn_ratio !== null && inv.turn_ratio !== undefined)
      parts.push(`TR=${inv.turn_ratio.toFixed(2)}`);
    if (inv.transit_times_days && inv.transit_times_days.length > 0)
      parts.push(`t=[${inv.transit_times_days.map((t) => t.toFixed(0)).join(",")}] d`);
    return parts.length > 0 ? parts.join(", ") : "—";
  }
  // non-keplerian
  const cr = entry.orbit_elements?.cr3bp;
  if (!cr) return "—";
  const parts: string[] = [];
  if (cr.family) parts.push(cr.family);
  if (cr.jacobi_constant !== null && cr.jacobi_constant !== undefined)
    parts.push(`C=${cr.jacobi_constant.toFixed(4)}`);
  if (cr.period_nd !== null && cr.period_nd !== undefined)
    parts.push(`T=${cr.period_nd.toFixed(4)}`);
  if (cr.stability_index !== null && cr.stability_index !== undefined)
    parts.push(`s=${cr.stability_index.toFixed(3)}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}

/**
 * Multiset of V∞ values, formatted as `body:value` pairs.
 */
export function fmtVinfMultiset(
  encounters: ReadonlyArray<{ body: string; vinf_kms: number | null }>,
): string {
  if (!encounters.length) return "—";
  const parts = encounters.map((e) =>
    e.vinf_kms === null ? `${e.body}:?` : `${e.body}:${e.vinf_kms.toFixed(2)}`,
  );
  return parts.join(", ");
}

// Provenance-source labels (shared by the catalogue table + the cycler detail
// page). Rows added via the orbit_source/vinf_source provenance system carry no
// `first_published` Citation (e.g. the bulk Russell-Ocampo 2006 census rows use
// `russell-2006-table5`); the Source column falls back to these labels so they
// render their real provenance instead of "?". Keep in sync with the upstream
// ProvenanceSource union (src/lib/types.ts).
export const SOURCE_LABEL: Record<string, string> = {
  "rogers-2012-t1": "Rogers et al. 2012, Table 1",
  "russell-2004-t34": "Russell 2004, Table 3.4",
  "russell-2004-t39_311": "Russell 2004, Tables 3.9 / 3.11",
  "russell-2004-t49_413": "Russell 2004, Tables 4.9 / 4.13",
  "russell-2006-table5": "Russell & Ocampo 2006, Table 5",
  "mcconaghy-2002": "McConaghy et al. 2002",
  "mcconaghy-2006": "McConaghy et al. 2006",
  "spec-9": "spec §9",
  "hollister-1970-t3": "Hollister & Menning 1970, Table 3",
  "friedlander-1986": "Friedlander et al. 1986",
  derived: "derived",
  computed: "computed",
};

export const sourceLabel = (k: string | null | undefined): string =>
  k ? (SOURCE_LABEL[k] ?? k) : "";

/**
 * Best human label for a row's source in a compact column: the first author +
 * year of `first_published` when present, else the provenance-source label
 * (orbit_source), else "—". Centralises the four-class fallback so the table and
 * detail pages agree.
 */
export function shortSourceLabel(entry: CyclerEntry): string {
  const cite = entry.first_published;
  if (cite && cite.authors.length > 0) {
    return `${cite.authors[0].split(",")[0]} ${cite.year}`;
  }
  return sourceLabel(entry.orbit_source) || "—";
}

// Axis-B maintenance-ΔV band labels (schema v4.8 / upstream #417). Short label
// for the catalogue badge; long label (with the m/s tier) for tooltips. Mirrors
// the /about#cycler-cost explainer. Most rows are unbanded (null) — the honest
// default; only rows with a sourced per-row maintenance ΔV carry a band.
export const DV_BAND_LABEL: Record<string, string> = {
  strictly_ballistic: "Strictly ballistic",
  essentially_ballistic: "Essentially ballistic",
  low_maintenance: "Low-maintenance",
  powered_dsm: "Powered",
  low_thrust_sep: "Low-thrust / SEP",
};

export const DV_BAND_LONG: Record<string, string> = {
  strictly_ballistic: "Strictly ballistic — < 1 m/s maintenance ΔV / 7 cycles",
  essentially_ballistic: "Essentially ballistic — < 10 m/s / 7 cycles",
  low_maintenance: "Low-maintenance — < 300 m/s / 7 cycles",
  powered_dsm: "Powered — ≥ 300 m/s / 7 cycles (impulsive/DSM)",
  low_thrust_sep: "Low-thrust / SEP maintenance",
};

export const dvBandLabel = (b: string | null | undefined): string =>
  b ? (DV_BAND_LABEL[b] ?? b) : "";
