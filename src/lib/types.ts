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
  // Cycle-level identity for multi-arc entries (spec §16.7.4).
  invariants?: Invariants | null;
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
