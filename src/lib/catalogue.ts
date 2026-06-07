import yaml from "js-yaml";
import type { CyclerEntry, Leg } from "./types";
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
  cache = parsed.map((entry) => ({
    ...entry,
    validation_level: entry.validation_level ?? ("V0" as const),
  }));
  return cache;
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
    const cr = entry.orbit_elements.cr3bp;
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
    coreOk = oe.a_au !== null && oe.a_au !== undefined && oe.e !== null && oe.e !== undefined;
  }
  if (!coreOk) return false;

  const vinfs = entry.vinf_kms_at_encounters;
  if (!vinfs.length || vinfs.some((v) => v.vinf_kms === null)) return false;
  const legs = legsOf(entry);
  if (!legs.length || legs.some((l) => l.tof_days === null)) return false;
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
    const a = entry.orbit_elements.a_au;
    const e = entry.orbit_elements.e;
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
  const cr = entry.orbit_elements.cr3bp;
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
