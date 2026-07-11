import { describe, it, expect } from "vitest";
import { reproducedEntries, reproducedCount, heroGroups, curvePlanFor, effectivePrimary } from "../hero-data";
import { loadCatalogue, getEntryById } from "../catalogue";

const URANIAN_IDS = [
  "umbriel-oberon-1-1-uranian-quasi-cycler-2026",
  "titania-oberon-1-1-uranian-quasi-cycler-2026",
  "ariel-oberon-1-1-uranian-quasi-cycler-2026",
  "umbriel-titania-1-1-uranian-quasi-cycler-2026",
  "ariel-titania-1-1-uranian-quasi-cycler-2026",
  "ariel-umbriel-1-1-uranian-quasi-cycler-2026",
];

// Hero data layer (task #227): the count is the LIVE filter, the grouping
// never drops a row, and the per-row render plan follows the honesty rules
// (never invent geometry; rows the data can't draw become badges).

describe("reproduced filter (V1+)", () => {
  it("matches a hand-rolled filter of the catalogue", () => {
    const expected = loadCatalogue().filter((e) =>
      ["V1", "V2", "V3", "V4", "V5"].includes(e.validation_level ?? "V0"),
    );
    expect(reproducedEntries().map((e) => e.id).sort()).toEqual(expected.map((e) => e.id).sort());
    expect(reproducedCount()).toBe(expected.length);
    expect(reproducedCount()).toBeGreaterThan(0);
  });

  it("excludes V0 rows", () => {
    for (const e of reproducedEntries()) {
      expect(e.validation_level).not.toBe("V0");
      expect(e.validation_level).toBeDefined();
    }
  });
});

describe("system grouping", () => {
  it("partitions the filter exactly (no row dropped, none duplicated)", () => {
    const g = heroGroups();
    const all = [...g.heliocentric, ...g.earthMoon, ...g.jovian, ...g.uranian, ...g.other].map((e) => e.id);
    expect(all.length).toBe(reproducedCount());
    expect(new Set(all).size).toBe(all.length);
  });

  it("groups by primary: Sun / Earth / Jupiter", () => {
    const g = heroGroups();
    for (const e of g.heliocentric) expect(e.primary ?? "Sun").toBe("Sun");
    for (const e of g.earthMoon) expect(e.primary).toBe("Earth");
    for (const e of g.jovian) expect(e.primary).toBe("Jupiter");
  });

  it("buckets the six Uranian rows (no primary field) via effectivePrimary, not Sun", () => {
    const g = heroGroups();
    expect(g.uranian.map((e) => e.id).sort()).toEqual([...URANIAN_IDS].sort());
    for (const e of g.uranian) {
      expect(e.primary).toBeUndefined();
      expect(e.bodies).toContain("Uranus");
      expect(effectivePrimary(e)).toBe("Uranus");
    }
    // None of them leaked into the heliocentric ("Sun" default) bucket.
    const helioIds = new Set(g.heliocentric.map((e) => e.id));
    for (const id of URANIAN_IDS) expect(helioIds.has(id)).toBe(false);
  });
});

describe("effectivePrimary", () => {
  it("prefers an explicit primary field over the Uranus heuristic", () => {
    const e = getEntryById("ross-rt-em-cycler-11-2025")!;
    expect(effectivePrimary(e)).toBe(e.primary);
  });

  it("defaults absent-primary, non-Uranus rows to Sun", () => {
    const e = getEntryById("aldrin-classic-em-k1-outbound");
    if (e && !e.primary) expect(effectivePrimary(e)).toBe("Sun");
  });
});

describe("curve plans (honesty rules)", () => {
  it("Aldrin rows (top-level (a,e) retired, #368) get a badge, never a fabricated curve", () => {
    // The classic Aldrin row's top-level orbit_elements (a,e) were RETIRED (main
    // repo #368: the (1.60, 0.393) figure-read pair is not a sourced literal). With
    // no top-level a/e the honesty rule correctly emits a badge rather than drawing
    // a curve from absent data. (A single-ellipse row that DOES carry top-level
    // (a,e) still gets a kepler-ellipse — exercised by the heliocentric scene test.)
    const e = getEntryById("aldrin-classic-em-k1-outbound")!;
    const plan = curvePlanFor(e);
    expect(e.orbit_elements?.a_au == null || e.orbit_elements?.e == null).toBe(true);
    expect(plan.kind).toBe("badge");
  });

  it("Russell multi-arc rows (no per-arc conics) get a ring, never a curve", () => {
    const e = getEntryById("russell-ch4-4.991gG2")!;
    const plan = curvePlanFor(e);
    expect(plan.kind).toBe("aphelion-ring");
    if (plan.kind === "aphelion-ring") {
      expect(plan.radiusAu).toBe(e.orbit_elements.aphelion_au);
      expect(plan.fidelity).toContain("max-aphelion ring only");
    }
  });

  it("Ross CR3BP rows get the rotating-frame propagation plan with provenance", () => {
    const e = getEntryById("ross-rt-em-cycler-11-2025")!;
    const plan = curvePlanFor(e);
    expect(plan.kind).toBe("cr3bp");
    if (plan.kind === "cr3bp") {
      expect(plan.stateNd).toHaveLength(6);
      expect(plan.fidelity).toContain("derived upstream");
    }
  });

  it("Liang Jovian rows become badges (geometry not reconstructible) — no curve", () => {
    const e = getEntryById("liang-2024-cgcec-111-highperijove")!;
    const plan = curvePlanFor(e);
    expect(plan.kind).toBe("badge");
  });
});
