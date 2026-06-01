import yaml from "js-yaml";
import type { CyclerEntry, Leg } from "./types";
// Vite raw-import: at build time the YAML file's contents are inlined as a
// string into the bundle. This is robust against Astro's prerender file
// layout (no filesystem reads at runtime) and works in both dev and
// production builds.
import rawYaml from "../data/seed_cyclers.yaml?raw";

let cache: CyclerEntry[] | null = null;

export function loadCatalogue(): CyclerEntry[] {
  if (cache) return cache;
  const parsed = yaml.load(rawYaml) as CyclerEntry[];
  // Tag every literature-seed entry as V0 — none of these have been
  // independently re-computed by this project yet. The validation level
  // will be promoted as the M3+ pipeline starts producing its own checks.
  cache = parsed.map((entry) => ({ ...entry, validation_level: "V0" as const }));
  return cache;
}

export function getEntryById(id: string): CyclerEntry | undefined {
  return loadCatalogue().find((e) => e.id === id);
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
 * library (spec §16.6.4): the orbit is completely specified — all core fields
 * present AND no acknowledged known-unknown (data_gaps[]).
 */
export function isFullyDefined(entry: CyclerEntry): boolean {
  if (entry.data_gaps && entry.data_gaps.length > 0) return false;
  const oe = entry.orbit_elements;
  if (oe.a_au === null || oe.a_au === undefined) return false;
  if (oe.e === null || oe.e === undefined) return false;
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
