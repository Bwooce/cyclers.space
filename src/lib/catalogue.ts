import yaml from "js-yaml";
import type { Citation, CyclerEntry, Leg, OrbitClass, ValidityWindow } from "./types";

/**
 * Strip internal work-tracking references from catalogue-sourced free text.
 *
 * The upstream data repo's prose (notes, source hints, venues, quotes) is
 * written against an internal task tracker whose items are referenced as
 * `#NNN` ("task #54", "task chain #558 -> ... -> #569", "Per #566: ..."). Those
 * numbers are meaningless to a site visitor, so they are stripped or rewritten
 * before render. Legitimate *published* indices that happen to share the shape
 * are preserved without the `#` sigil: Russell's parent-cycler numbers
 * ("4.991gG2 (#83)" → "4.991gG2 (no. 83)"), Russell-Strange table indices
 * ("moon cycler #131" → "moon cycler no. 131"), per-flyby/arc numbering
 * ("flyby #0" → "flyby 0"), and identifier-embedded hashes ("JPL-CL#17-3322",
 * untouched). Applied once at the loader so every render site inherits it.
 */
export function sanitizeCatalogueText(text: string): string {
  let s = text;

  // --- Preserve legitimate published indices (rewritten without "#"). ---
  // "flyby #0" / "arc #2" (Liang 2024 flyby numbering, loop-arc numbering).
  s = s.replace(/\b(flyby|arc)\s*#(\d+)/gi, "$1 $2");
  // Russell designation followed by its table index: "4.991gG2 (#83)" /
  // "4.991gG2(#83)" / "3.768Gh-3 (#54)" / bare "4.991gG2 #83".
  const RUSSELL_CODE = /(\d\.\d{2,3}[A-Za-z][A-Za-z0-9+-]*)/.source;
  s = s.replace(new RegExp(`${RUSSELL_CODE}\\s*\\(#(\\d+)\\)`, "g"), "$1 (no. $2)");
  s = s.replace(new RegExp(`${RUSSELL_CODE}\\s+#(\\d+)\\b`, "g"), "$1 no. $2");
  // Index before the designation: "for #83 4.991gG2".
  s = s.replace(new RegExp(`#(\\d+)\\s+${RUSSELL_CODE}`, "g"), "no. $1 $2");
  // "parent cycler #162" / "ballistic moon cycler #131" (Russell-Strange 2009).
  s = s.replace(/\b(cycler)\s+#(\d+)\b/gi, "$1 no. $2");

  // --- Remove internal task references. ---
  // Whole "task chain #a -> #b -> ..." sequences (venue-style, no prose).
  s = s.replace(/[;,]?\s*task\s+chain:?\s*#\d+(\s*(?:->|→)\s*#\d+)*/gi, "");
  // Possessives: "#312's own" / "task #312's" / "#399's". The "#N's own X"
  // shape always refers back to a family's first-documented row in the
  // upstream prose; "its own" would misread as self-reference.
  s = s.replace(/#\d+[\w-]*['’]s\s+own\b/g, "the family's first-documented member's own");
  s = s.replace(/\btask\s+#\d+[\w-]*['’]s/gi, "the");
  s = s.replace(/#\d+[\w-]*['’]s/g, "the");
  // Noun usages where bare deletion would break grammar:
  // "chain #312 itself cleared", "than #312, which ...".
  s = s.replace(/#\d+[\w-]*\s+(?=itself\b)/g, "the earlier row ");
  s = s.replace(/#\d+[\w-]*(?=,\s*which\b)/g, "the earlier row");
  // Verb-subject usages: "#399 DERIVES it ...", "until #365 promotes it".
  s = s.replace(/#\d+\s+DERIVES\b/g, "we derive");
  s = s.replace(/until\s+#\d+\s+promotes\b/gi, "until a later verification pass promotes");
  // "task #54" / "tasks #54" (with optional suffix like "#54-backfill").
  s = s.replace(/\btasks?\s+#\d+[\w-]*\s*/gi, "");
  // Token groups deleted as a unit ("#567/#568", "#561/#562/#563",
  // "#330->#335") so no orphan "/" or "->" separators are left behind —
  // a lone " / " elsewhere can be legitimate prose and must survive.
  s = s.replace(/(?<![\w-])#\d+[\w-]*(?:\s*(?:\/|,|->|→)\s*#\d+[\w-]*)+/g, "");
  // Catch-all: any remaining standalone task token. The lookbehind protects
  // identifier-embedded hashes ("JPL-CL#17-3322"). A lowercase preposition
  // whose object is the deleted token goes with it ("enumerated by #563." →
  // "enumerated."), so no dangling "by)" / "of)." is left behind.
  s = s.replace(/(?:\b(?:by|of|per|via|from)\s+)?(?<![\w-])#\d+[a-z]?(?:-[A-Za-z][\w-]*)?/g, "");

  // --- Punctuation cleanup after deletions. ---
  s = s.replace(/(?:\s*(?:->|→)){2,}(?=\s|$)/g, "");
  // Parens that now contain only deletion-detritus separators: "()", "(->)",
  // "(/)", "(, )". Deliberately NOT bare "-", "+" or "." — "(-)", "(+)" and
  // "g(...)" are legitimate notation that must survive.
  s = s.replace(/\s*\(\s*(?:(?:->|→|[/;,])\s*)*\)/g, "");
  // Dangling "--" before a closing paren: "(V4, windowed --)" → "(V4, windowed)".
  s = s.replace(/\s*--\s*\)/g, ")");
  // Dangling list separator before a closing paren: "(a.bsp; )" → "(a.bsp)".
  s = s.replace(/[;,]\s*\)/g, ")");
  // Trailing whitespace a deletion left at a (pre-wrap) line end.
  s = s.replace(/[ \t]+$/gm, "");
  // "( wave 2" → "(wave 2"; "(; N=731" → "(N=731"; "(, 2026" → "(2026".
  s = s.replace(/\(\s*[,;]?\s+/g, "(");
  s = s.replace(/\s+\)/g, ")");
  // Space before punctuation: "than , which" → handled above; " ." / " ," etc.
  s = s.replace(/[ \t]+([,;.])/g, "$1");
  // Doubled separators left by a deleted mid-list token: "paper,, tabulates".
  s = s.replace(/,\s*,/g, ",").replace(/;\s*;/g, ";");
  // A deleted trailing "#399." citation leaves a double full stop ("<0.1%..");
  // exactly two dots collapse to one, real "..." ellipses are untouched.
  s = s.replace(/(?<!\.)\.\.(?!\.)/g, ".");
  // Collapse doubled spaces (but not newlines — notes render pre-wrap).
  s = s.replace(/[ \t]{2,}/g, " ");
  // Trailing separators at end of the whole string.
  s = s.replace(/\s*[;,]\s*$/g, "");
  return s.trim();
}
import windowsData from "../data/windows.json";
// Vite raw-import: at build time the YAML file's contents are inlined as a
// string into the bundle. This is robust against Astro's prerender file
// layout (no filesystem reads at runtime) and works in both dev and
// production builds.
// src/data/catalogue.yaml is NOT committed — it is fetched from the single
// source of truth (Bwooce/cyclers) by the `prebuild`/`predev` sync step
// (scripts/sync-catalogue.mjs). This repo keeps no duplicate of the catalogue.
import rawYaml from "../data/catalogue.yaml?raw";

/** sanitizeCatalogueText applied only when the value is a string. */
const clean = <T extends string | null | undefined>(v: T): T =>
  (typeof v === "string" ? (sanitizeCatalogueText(v) as T) : v);

/** Sanitize a Citation's rendered text fields (title, venue, note). */
function cleanCitation<T extends Citation | null | undefined>(c: T): T {
  if (!c) return c;
  return { ...c, title: clean(c.title), venue: clean(c.venue), note: clean(c.note) } as T;
}

/** Recursively sanitize every string in a source_quotes-style object. */
function cleanDeepStrings<T>(v: T): T {
  if (typeof v === "string") return sanitizeCatalogueText(v) as unknown as T;
  if (Array.isArray(v)) return v.map(cleanDeepStrings) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = cleanDeepStrings(val);
    }
    return out as T;
  }
  return v;
}

/**
 * Sanitize every catalogue-sourced free-text field the site renders (see
 * sanitizeCatalogueText). Done once at the loader — not per render site — so a
 * new template can't accidentally reintroduce raw task numbers. Numeric /
 * identifier fields (id, sources-registry keys, dates) are left untouched.
 */
function sanitizeEntryText(entry: CyclerEntry): CyclerEntry {
  const e = { ...entry };
  e.name = clean(e.name);
  e.notes = clean(e.notes);
  e.source_ephemeris = clean(e.source_ephemeris);
  e.first_published = cleanCitation(e.first_published);
  if (e.corroborating_sources) e.corroborating_sources = e.corroborating_sources.map(cleanCitation);
  if (e.orbit_elements) e.orbit_elements = { ...e.orbit_elements, note: clean(e.orbit_elements.note) };
  if (e.period) e.period = { ...e.period, note: clean(e.period.note) };
  if (e.vinf_kms_at_encounters)
    e.vinf_kms_at_encounters = e.vinf_kms_at_encounters.map((v) => ({ ...v, note: clean(v.note) }));
  if (e.legs) e.legs = e.legs.map((l) => ({ ...l, note: clean(l.note) }));
  if (e.trajectory?.segments)
    e.trajectory = {
      ...e.trajectory,
      segments: e.trajectory.segments.map((s) => ({ ...s, note: clean(s.note) })),
    };
  if (e.data_gaps)
    e.data_gaps = e.data_gaps.map((g) => ({ ...g, note: clean(g.note), source_hint: clean(g.source_hint) }));
  if (e.source_quotes) e.source_quotes = cleanDeepStrings(e.source_quotes);
  if (e.family)
    e.family = { ...e.family, name: clean(e.family.name), nomenclature: clean(e.family.nomenclature) };
  return e;
}

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
    return sanitizeEntryText({
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
    });
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
  resonant_po: "Resonant PO",
};

/** Long-form label used in tooltips and the detail page. */
export const ORBIT_CLASS_LONG_LABEL: Record<OrbitClass, string> = {
  cycler: "strict cycler (infinite returns)",
  quasi_cycler: "quasi-cycler (epoch-locked, finite returns)",
  precursor_mga: "precursor MGA (one-shot insertion into a cycler)",
  mga_tour: "MGA tour (one-shot terminal arrival)",
  resonant_po: "resonant periodic orbit (stable, no transport utility)",
};

/**
 * "Struct" column / cycler_class: the STRUCTURAL representation of the
 * trajectory (a separate axis from orbit_class, which is about transport
 * role — see ORBIT_CLASS_LABEL). Short label for the badge text.
 */
export const CYCLER_CLASS_LABEL: Record<string, string> = {
  "single-ellipse": "Single ellipse",
  "multi-arc": "Multi-arc",
  "non-keplerian": "Non-Keplerian (CR3BP)",
};

/** Long-form definition for tooltips — what each structural kind actually is. */
export const CYCLER_CLASS_LONG_LABEL: Record<string, string> = {
  "single-ellipse":
    "Single ellipse — one continuous heliocentric Keplerian orbit (a, e, i, Ω, ω); the whole trajectory is one conic section.",
  "multi-arc":
    "Multi-arc — a chain of separate ballistic legs (gravity-assist flybys / deep-space manoeuvres) stitched together; each leg can have its own orbital elements.",
  "non-keplerian":
    "Non-Keplerian (CR3BP) — a periodic or quasi-periodic orbit in the rotating (synodic) frame of a three-body system, identified by its Jacobi constant rather than classical (a, e) elements. Not a Keplerian ellipse at all.",
};

/**
 * epoch_locked (schema v5): true for any row whose validity is a bounded
 * real-world date range rather than an indefinite repeat. Short tooltip for
 * the filter hint / column header.
 */
export const EPOCH_LOCKED_HINT =
  "Epoch-locked: this row is only valid for a bounded real-world date range (see the Validity column) — unlike a strict cycler, which repeats on the same schedule indefinitely regardless of calendar date.";

/**
 * "Ballistic" (base term, independent of the specific ΔV band): the
 * idealised-model claim that no deterministic engine burns are needed to
 * keep the trajectory on schedule — gravity alone does the steering. See
 * DV_BAND_LONG for the specific bands and /about/#cycler-cost for the full
 * explanation including why no real cycler is genuinely zero-ΔV forever.
 */
export const BALLISTIC_HINT =
  "Ballistic: in the idealised model, no deterministic engine burns are needed to stay on schedule — gravity alone does the steering. \"Powered\" bands need regular burns instead. See the ΔV-band tooltip for this row's specific tier.";

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

// Spec §16.4 (upstream #444) our_status — short table labels and long titles.
export const OUR_STATUS_LABEL: Record<string, string> = {
  "known-reproduction": "reproduction",
  "known-class-member": "known-class",
  "candidate-novel": "candidate",
};

export const OUR_STATUS_LONG: Record<string, string> = {
  "known-reproduction":
    "Computed literal reproduction of a single published orbit",
  "known-class-member":
    "Computed member of a published class — not a novel discovery and not a literal reproduction of any single published orbit",
  "candidate-novel": "Candidate not yet found in the published record",
};

export const ourStatusLabel = (s: string | null | undefined): string =>
  s ? (OUR_STATUS_LABEL[s] ?? s) : "";

/**
 * Honest predicate (#462): is this row a genuine, original discovery BY THIS
 * PROJECT — as opposed to a reproduction of a published orbit, a computed
 * member of a published class, or a literature anchor?
 *
 * STRICT — a row qualifies ONLY if ALL of the following hold, so that no
 * reproduction or known-class member is ever mis-surfaced as "ours":
 *  1. `source === "discovered"` — the row was found by our search, not seeded
 *     from the literature (this also excludes `this-project` rows like the C21
 *     known-class member, which are computed-but-not-novel).
 *  2. `first_published.authors` names the cyclerfinder project — WE are the
 *     first to publish this specific orbit.
 *  3. `corroborating_sources` is empty — no external source pre-published the
 *     same orbit (a non-empty list means someone else got there too).
 *  4. `our_status` is NOT a known-reproduction or known-class-member — those
 *     are explicit "not a discovery" tags.
 *
 * Data-driven: keyed off catalogue fields only, never a hard-coded id, so a
 * future discovery row auto-qualifies the moment it lands. When in doubt the
 * row does NOT qualify — over-claiming a reproduction is the failure mode.
 */
export function isProjectDiscovery(entry: CyclerEntry): boolean {
  if (entry.source !== "discovered") return false;
  const authors = entry.first_published?.authors ?? [];
  const byProject = authors.some((a) => (a ?? "").toLowerCase().includes("cyclerfinder"));
  if (!byProject) return false;
  const corroborating = entry.corroborating_sources ?? [];
  if (corroborating.length > 0) return false;
  if (entry.our_status === "known-reproduction" || entry.our_status === "known-class-member") {
    return false;
  }
  return true;
}

/**
 * All catalogue rows that pass {@link isProjectDiscovery}, sorted most-validated
 * first (V5 → V0) then by name. Drives the "Discovered here" strip at the top of
 * the catalogue page.
 */
export function projectDiscoveries(): CyclerEntry[] {
  const order = (e: CyclerEntry): number => {
    const lvl = e.validation_level ?? "V0";
    const n = Number.parseInt(lvl.slice(1), 10);
    return Number.isFinite(n) ? n : 0;
  };
  return loadCatalogue()
    .filter(isProjectDiscovery)
    .sort((a, b) => order(b) - order(a) || a.name.localeCompare(b.name));
}
