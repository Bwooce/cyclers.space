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

export interface PeriodBasisItem {
  pair: string;
  k: number;
}

export interface PeriodInfo {
  pair: string;
  k: number;
  years: number;
  note?: string;
  // Schema v4 (2026-06-03): beat-period basis for n-body (VEM) cyclers.
  basis?: PeriodBasisItem[] | null;
}

export interface VinfEncounter {
  body: Body;
  vinf_kms: number | null;
  note?: string;
}

// Schema v4 (2026-06-03): cycler structural class, invariants, and CR3BP identity.
export type CyclerClass = "single-ellipse" | "multi-arc" | "non-keplerian";

// Schema v5 (2026-06-15): catalogue scope expanded from cyclers-only to a four-
// class taxonomy (see project_catalogue_scope_expanded_2026-06-15). `orbit_class`
// is additive-optional; rows without it default to "cycler" for backward compat
// during the upstream migration window (loadCatalogue applies the default).
//
// The classes:
//   - cycler        : strictly periodic, NOT epoch-locked, infinite returns
//                     (Aldrin, Russell-Ocampo, Braik-Ross — the gold standard).
//   - quasi_cycler  : closes-up-to-rotation INSIDE an epoch-locked 10-15 yr window;
//                     finite returns (3-15). "Cyclers-of-opportunity."
//   - precursor_mga : non-repeating one-shot MGA chain that inserts a spacecraft
//                     into an extant cycler. Single insertion. `inserts_into`
//                     points at the cycler row it feeds.
//   - mga_tour      : non-repeating MGA tour with a terminal arrival
//                     (Galileo VEEGA, Cassini VVEJGA, Tito 2018).
export type OrbitClass = "cycler" | "quasi_cycler" | "precursor_mga" | "mga_tour";

// Schema v5 validity window — when the trajectory is reachable for the epoch-
// locked classes (quasi_cycler / precursor_mga / mga_tour). ISO-8601 dates.
export interface ValidityWindow {
  start: string;
  end: string;
}

// Cycle-level identity descriptors for multi-arc cyclers (spec §16.7.4).
export interface Invariants {
  aphelion_ratio: number | null;
  turn_ratio: number | null;
  transit_times_days: number[] | null;
}

// CR3BP identity tuple for non-keplerian orbits (spec §16.7.4).
export interface Cr3bp {
  family: string | null;
  mass_ratio: number | null;
  libration_point: string | null;
  jacobi_constant: number | null;
  period_nd: number | null;
  stability_index: number | null;
  state_nd: number[] | null;
  lunit_km: number | null;
  tunit_s: number | null;
}

export interface OrbitElements {
  a_au: number | null;
  e: number | null;
  perihelion_au: number | null;
  aphelion_au: number | null;
  inclination_deg: number | null;
  note?: string;
  // Schema v2 (2026-06-01): 3D orientation children (spec §16.1). Present in
  // the YAML, frequently null — when null the orbit view draws the in-plane
  // ellipse and labels it coplanar-idealized (task #132, design Q5).
  raan_deg?: number | null;
  arg_periapsis_deg?: number | null;
  true_anomaly_deg?: number | null;
  epoch_iso8601?: string | null;
  // Schema v4 (2026-06-03): frame/center tags and CR3BP identity block.
  reference_frame?: string | null;
  center?: string | null;
  cr3bp?: Cr3bp | null;
}

export interface Leg {
  from: Body;
  to: Body;
  tof_days: number | null;
  n_revs: number;
  note?: string;
}

// Schema v3 (2026-06-01): OCM-aligned trajectory{} (TRAJ segments + MAN
// maneuvers), family{} linkage, and the data_gaps[] known-unknown register.
// See upstream docs/spec.md §16.6 and data/README.md "Schema v3". All three
// are additive-optional; legs[] above remains valid for un-migrated entries.
export type TrajType = "keplerian-arc" | "cartesian-state";
export type LambertBranch = "single" | "low" | "high";

export interface Segment {
  id: string;
  from: Body;
  to: Body;
  traj_type?: TrajType;
  tof_days: number | null;
  n_revs: number | null;
  branch?: LambertBranch | null;
  a_au?: number | null;
  e?: number | null;
  note?: string;
  // Schema v4.2 (spec §16.7.9): the body this segment's conic/arc is centred
  // on (absent ⇒ "Sun"), and a published [min, max] time-of-flight range in
  // days (not required to contain tof_days — different model framings of one
  // physical leg may both be sourced).
  center?: string;
  tof_days_bounds?: [number, number] | null;
}

export type ManeuverType = "flyby-ballistic" | "flyby-powered" | "launch" | "arrival";

export interface Maneuver {
  at_segment_boundary: string[];
  body: Body;
  type: ManeuverType;
  dv_kms: number | null;
  turning_angle_deg?: number | null;
  periapsis_alt_km?: number | null;
  note?: string;
}

export interface Trajectory {
  center?: string;
  ref_frame?: string;
  time_system?: string | null;
  epoch_tzero?: string | null;
  segments: Segment[];
  maneuvers?: Maneuver[];
}

export interface Family {
  id: string;
  name?: string;
  nomenclature?: string;
  continuation_param?: { name: string; value: number | string };
}

// Schema v4.1 (spec §16.7.7): Russell's Earth-to-Earth free-return arc
// decomposition. Distinct from trajectory.segments (encounter legs). Only
// meaningful for multi-arc cyclers.
export type FreeReturnArcType = "generic" | "half-rev" | "full-rev";

export interface FreeReturnArc {
  arc_type: FreeReturnArcType;
  resonance?: string | null;
  tof_years?: number | null;
  raw_descriptor?: string | null;
}

// Schema v4.4 (spec §16.7.11): per-field provenance vocabulary.
export type ProvenanceSource =
  | "rogers-2012-t1"
  | "russell-2004-t34"
  | "russell-2004-t39_311"
  | "russell-2004-t49_413"
  | "mcconaghy-2002"
  | "mcconaghy-2006"
  | "spec-9"
  | "hollister-1970-t3"
  | "friedlander-1986"
  | "derived"
  | "computed"
  | string;
export type ProvenanceFidelity = "circular-coplanar" | "analytic-ephemeris" | "real-de440" | string;
export type ValidationTier = "cross_validated" | "consistency_checked" | "unvalidated" | string;

export type DataGapKind = "unknown" | "uncertain" | "derive";

export interface DataGap {
  path: string;
  kind: DataGapKind;
  note?: string;
  source_hint?: string | null;
  todo_ref?: string | null;
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
  // Schema v4 (2026-06-03). Defaults: cycler_class "single-ellipse".
  cycler_class?: CyclerClass;
  // Schema v5 (2026-06-15): four-class taxonomy. Defaults to "cycler" via
  // loadCatalogue() for any row that pre-dates the upstream migration. Rows
  // produced after the migration MUST set this explicitly. See OrbitClass docs.
  orbit_class?: OrbitClass;
  // Always false for `cycler`; always true for the other three. Defaulted in
  // loadCatalogue() to mirror orbit_class (cycler ⇒ false).
  epoch_locked?: boolean;
  // Integer count of returns, or "infinite" for the strict cycler class. Absent
  // ⇒ "infinite" when orbit_class resolves to "cycler". For the epoch-locked
  // classes a finite integer is expected (1 for one-shot precursor/tour rows).
  n_returns?: number | "infinite";
  // When the trajectory is reachable. Only meaningful for epoch-locked classes;
  // absent for `cycler` rows (a strict cycler has no validity window — it
  // repeats forever once established).
  validity_window?: ValidityWindow | null;
  // Specific launch date for `mga_tour` / `precursor_mga` rows. ISO-8601.
  launch_epoch?: string | null;
  // For `precursor_mga` rows: the catalogue id of the `cycler` row this MGA
  // chain inserts a spacecraft into. The V0 check requires this id to resolve
  // to an extant cycler row.
  inserts_into?: string | null;
  // Cycle-level identity for multi-arc entries (spec §16.7.4).
  invariants?: Invariants | null;
  // Schema v4.1 (spec §16.7.7): Russell free-return arc descriptors.
  free_return_arcs?: FreeReturnArc[] | null;
  // Schema v4.2 (spec §16.7.9): ephemeris model the source's numbers trace to.
  source_ephemeris?: string | null;
  // Schema v4.3 (spec §16.7.10): row supersession links (referential).
  superseded_by?: string[] | null;
  supersedes?: string[] | null;
  // Schema v4.4 (spec §16.7.11): per-field provenance tags. Absent = unknown.
  orbit_source?: ProvenanceSource | null;
  vinf_source?: ProvenanceSource | null;
  orbit_fidelity?: ProvenanceFidelity | null;
  vinf_fidelity?: ProvenanceFidelity | null;
  validation_tier?: ValidationTier | null;
  delta_v_kms?: number | null;
  v_infinity_leveraging_dv_kms?: number | null;
  fleet_size?: number | null;
  bodies: Body[];
  sequence_canonical: string;
  sense: "outbound" | "inbound" | "n/a" | string;
  period: PeriodInfo;
  vinf_kms_at_encounters: VinfEncounter[];
  orbit_elements: OrbitElements;
  // Legacy flat legs[]; optional since schema v3 supersedes it with
  // trajectory.segments. Read both via legsOf() in lib/catalogue.
  legs?: Leg[];
  // Schema v3 (2026-06-01) — additive optional.
  trajectory?: Trajectory;
  family?: Family | null;
  data_gaps?: DataGap[];
  first_published: Citation;
  corroborating_sources?: Citation[];
  priority_date: string;
  notes?: string;
  source_quotes?: Record<string, string>;
  // Catalogue-level (not in YAML; assigned by site): all literature seed
  // entries are V0 ("literature, not independently validated").
  validation_level?: "V0" | "V1" | "V2" | "V3" | "V4" | "V5";
}
