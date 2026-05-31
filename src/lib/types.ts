// Catalogue entry shape, derived from cyclers/docs/spec.md §16.1 and the
// seed YAML at src/data/seed_cyclers.yaml. This is the YAML/literature shape:
// a subset of the full §16.1 record, with full source attribution. Fields
// that the seed file leaves as `null` are typed as nullable here.

export type Body = "V" | "E" | "M" | "Moon" | "Io" | "Europa" | "Ganymede" | "Callisto" | string;

// Schema v2 (2026-06-01): the trajectory class and modeling assumption are
// now explicit fields. See upstream data/README.md "Schema v2".
export type TrajectoryRegime = "ballistic" | "low-thrust" | "manifold";
export type ModelAssumption = "circular-coplanar" | "analytic-ephemeris" | "cr3bp";

export interface Citation {
  authors: string[];
  year: number;
  title: string;
  venue: string;
  date?: string | null;
  doi?: string | null;
  url?: string | null;
  note?: string | null;
}

export interface PeriodInfo {
  pair: string;
  k: number;
  years: number;
  note?: string;
}

export interface VinfEncounter {
  body: Body;
  vinf_kms: number | null;
  note?: string;
}

export interface OrbitElements {
  a_au: number | null;
  e: number | null;
  perihelion_au: number | null;
  aphelion_au: number | null;
  inclination_deg: number | null;
  note?: string;
}

export interface Leg {
  from: Body;
  to: Body;
  tof_days: number | null;
  n_revs: number;
  note?: string;
}

export interface CyclerEntry {
  id: string;
  name: string;
  source: "literature" | "this-project" | "both";
  // Non-heliocentric extension (2026-05-31). Defaults to "Sun" when absent.
  primary?: string;
  // Schema v2 (2026-06-01). Defaults: trajectory_regime "ballistic",
  // model_assumption "circular-coplanar".
  trajectory_regime?: TrajectoryRegime;
  model_assumption?: ModelAssumption;
  delta_v_kms?: number | null;
  v_infinity_leveraging_dv_kms?: number | null;
  fleet_size?: number | null;
  bodies: Body[];
  sequence_canonical: string;
  sense: "outbound" | "inbound" | "n/a" | string;
  period: PeriodInfo;
  vinf_kms_at_encounters: VinfEncounter[];
  orbit_elements: OrbitElements;
  legs: Leg[];
  first_published: Citation;
  corroborating_sources?: Citation[];
  priority_date: string;
  notes?: string;
  source_quotes?: Record<string, string>;
  // Catalogue-level (not in YAML; assigned by site): all literature seed
  // entries are V0 ("literature, not independently validated").
  validation_level?: "V0" | "V1" | "V2" | "V3" | "V4" | "V5";
}
