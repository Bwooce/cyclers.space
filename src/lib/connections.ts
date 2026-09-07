import yaml from "js-yaml";
// Vite raw-import, same mechanism as catalogue.ts/errata.ts: the YAML contents
// are inlined as a string at build time. src/data/manifold_connections.yaml IS
// committed (small, like errata.yaml) so the build is reproducible offline; the
// `prebuild`/`predev` sync step (scripts/sync-catalogue.mjs) refreshes it from
// the single source of truth (Bwooce/cyclers data/manifold_connections.yaml,
// validated upstream against data/manifold_connection.schema.json, task #838
// design / #856 implementation).
//
// SCOPE (mirrors the upstream schema's own top-level description): this
// registry records EXTRINSIC manifold connections — a verified transport
// statement BETWEEN two orbits, where at least one endpoint is a catalogued
// row and the other may be an inline `uncatalogued` descriptor (the
// half-catalogued base case; no entry with BOTH endpoints catalogued exists
// today, but the rendering below handles it for free). It is
// "provenance/audit only — not a promotion gate": a connection entry NEVER
// implies either endpoint's `validation_level` changed — see
// EVIDENCE_KIND_LABEL below and #857's design note for the full reasoning.
import rawYaml from "../data/manifold_connections.yaml?raw";
import { sanitizeCatalogueText } from "./catalogue";

export type ConnectionKind = "heteroclinic" | "homoclinic";
export type ModelType = "cr3bp" | "ccr4bp" | "crnbp";

export interface ConnectionModel {
  type: ModelType;
  system: string;
  mass_ratio: number;
}

export interface RowRefEndpoint {
  row_ref: string;
  identity_evidence: string;
  model_note?: string | null;
}

export interface UncataloguedEndpoint {
  uncatalogued: {
    family: string;
    state_nd?: number[] | null;
    x0?: number | null;
    ydot0?: number | null;
    period_nd?: number | null;
    jacobi_constant?: number | null;
    lambda_max?: number | null;
    derivation: string;
  };
}

export type ConnectionEndpoint = RowRefEndpoint | UncataloguedEndpoint;

export function isRowRefEndpoint(ep: ConnectionEndpoint): ep is RowRefEndpoint {
  return "row_ref" in ep;
}

export interface ConnectionProvenance {
  task_refs: string[];
  data: string;
  module: string;
  commit?: string | null;
  notes?: string[] | null;
}

export interface ManifoldConnection {
  id: string;
  kind: ConnectionKind;
  model: ConnectionModel;
  jacobi_constant?: number | null;
  // Ordered pair: index 0 = unstable-manifold origin, index 1 = stable-
  // manifold destination (the connection is directed).
  endpoints: [ConnectionEndpoint, ConnectionEndpoint];
  connection: Record<string, unknown>;
  evidence: Record<string, unknown>;
  evidence_class: string;
  reverse_of?: string | null;
  round_trip_note?: string | null;
  dv_kms?: number | null;
  provenance: ConnectionProvenance;
}

let cache: ManifoldConnection[] | null = null;

function sanitizeEndpoint(ep: ConnectionEndpoint): ConnectionEndpoint {
  if (isRowRefEndpoint(ep)) {
    return {
      ...ep,
      identity_evidence: sanitizeCatalogueText(ep.identity_evidence),
      model_note: ep.model_note ? sanitizeCatalogueText(ep.model_note) : ep.model_note,
    };
  }
  return {
    uncatalogued: {
      ...ep.uncatalogued,
      family: sanitizeCatalogueText(ep.uncatalogued.family),
      derivation: sanitizeCatalogueText(ep.uncatalogued.derivation),
    },
  };
}

export function loadConnections(): ManifoldConnection[] {
  if (cache) return cache;
  const parsed = yaml.load(rawYaml) as ManifoldConnection[];
  // The upstream registry's free text is dense with internal work-item
  // references ("#828 independent re-run: ...") — sanitize every free-text
  // field the same way errata.ts/catalogue.ts do, per field, at load time.
  cache = parsed.map((c) => ({
    ...c,
    endpoints: [sanitizeEndpoint(c.endpoints[0]), sanitizeEndpoint(c.endpoints[1])] as [
      ConnectionEndpoint,
      ConnectionEndpoint,
    ],
    evidence_class: sanitizeCatalogueText(c.evidence_class),
    round_trip_note: c.round_trip_note ? sanitizeCatalogueText(c.round_trip_note) : c.round_trip_note,
    // provenance.data/module/notes are rendered under "verification numbers"
    // (Source: <code>...</code>) and carried a raw task token for the Vaquero
    // C=2.54 row until 2026-09-07; task_refs are internal and never rendered.
    provenance: {
      ...c.provenance,
      data: sanitizeCatalogueText(c.provenance.data),
      module: sanitizeCatalogueText(c.provenance.module),
      notes: c.provenance.notes ? c.provenance.notes.map(sanitizeCatalogueText) : c.provenance.notes,
    },
  }));
  return cache;
}

/** Connections where any endpoint's row_ref === the given catalogue row id. */
export function connectionsForRow(rowId: string): ManifoldConnection[] {
  return loadConnections().filter((c) =>
    c.endpoints.some((e) => isRowRefEndpoint(e) && e.row_ref === rowId),
  );
}

export type EvidenceKind = "self-consistency" | "digit-grade" | "other";

/**
 * Classify `evidence_class`'s free text by its documented prefix convention
 * (upstream: SELF-CONSISTENCY ONLY / DIGIT-GRADE REPRODUCTION / ...). "other"
 * degrades to showing the sanitized text itself rather than a mislabel, so a
 * future third class is visible, not silently miscategorized.
 */
export function evidenceKind(c: ManifoldConnection): EvidenceKind {
  if (/^SELF-CONSISTENCY/i.test(c.evidence_class)) return "self-consistency";
  if (/^DIGIT-GRADE/i.test(c.evidence_class)) return "digit-grade";
  return "other";
}

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  "self-consistency":
    "verified by this project's own numerical battery (no published transfer state exists to compare against)",
  "digit-grade": "reproduces a state published in the literature",
  other: "", // caller falls back to the sanitized evidence_class text itself
};
