import yaml from "js-yaml";
// Vite raw-import, same mechanism as catalogue.ts: the YAML contents are
// inlined as a string at build time. src/data/errata.yaml IS committed (small,
// like planet-elements.json) so the build is reproducible offline; the
// `prebuild`/`predev` sync step (scripts/sync-catalogue.mjs) refreshes it from
// the single source of truth (Bwooce/cyclers data/errata.yaml, validated
// upstream against data/errata.schema.json).
import rawYaml from "../data/errata.yaml?raw";

export type ErratumConfidence =
  | "confirmed-in-print"
  | "provable-internal-inconsistency"
  | "unresolved-discrepancy";

export type ErratumVorStatus = "final-form" | "preprint-may-be-fixed-in-vor";

export type ErratumStatus = "open" | "author-confirmed" | "author-refuted" | "fixed-in-vor";

export interface ErratumEntry {
  id: string;
  paper: string;
  doi_or_url: string;
  location: string;
  printed_value: string;
  derived_value: string;
  reasoning: string;
  evidence_refs: string[];
  confidence: ErratumConfidence;
  affected_catalogue_rows: string[];
  vor_status: ErratumVorStatus;
  vor_note?: string;
  status: ErratumStatus;
  minor?: boolean;
}

let cache: ErratumEntry[] | null = null;

export function loadErrata(): ErratumEntry[] {
  if (cache) return cache;
  cache = yaml.load(rawYaml) as ErratumEntry[];
  return cache;
}

/** Entries grouped by paper citation, preserving ledger order. */
export function errataByPaper(): { paper: string; doi_or_url: string; entries: ErratumEntry[] }[] {
  const groups: { paper: string; doi_or_url: string; entries: ErratumEntry[] }[] = [];
  for (const entry of loadErrata()) {
    const existing = groups.find((g) => g.paper === entry.paper);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.push({ paper: entry.paper, doi_or_url: entry.doi_or_url, entries: [entry] });
    }
  }
  return groups;
}

/** Errata whose affected_catalogue_rows include the given catalogue row id. */
export function errataForRow(rowId: string): ErratumEntry[] {
  return loadErrata().filter((e) => e.affected_catalogue_rows.includes(rowId));
}

export const CONFIDENCE_LABEL: Record<ErratumConfidence, string> = {
  "confirmed-in-print": "confirmed in print",
  "provable-internal-inconsistency": "provable internal inconsistency",
  "unresolved-discrepancy": "unresolved — question for the authors",
};

export const CONFIDENCE_TITLE: Record<ErratumConfidence, string> = {
  "confirmed-in-print":
    "The page was re-read twice and an independent reproduction disagrees with the printed value.",
  "provable-internal-inconsistency":
    "The source is mathematically impossible or self-contradictory as printed.",
  "unresolved-discrepancy":
    "Our reproduction disagrees but we hold no independent proof — phrased as a question for the authors.",
};
