import yaml from "js-yaml";
import type { CyclerEntry } from "./types";
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
