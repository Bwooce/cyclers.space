import { describe, it, expect } from "vitest";
import { reproducedEntries, reproducedCount, heroGroups, curvePlanFor } from "../hero-data";
import { loadCatalogue, getEntryById } from "../catalogue";

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
    const all = [...g.heliocentric, ...g.earthMoon, ...g.jovian, ...g.other].map((e) => e.id);
    expect(all.length).toBe(reproducedCount());
    expect(new Set(all).size).toBe(all.length);
  });

  it("groups by primary: Sun / Earth / Jupiter", () => {
    const g = heroGroups();
    for (const e of g.heliocentric) expect(e.primary ?? "Sun").toBe("Sun");
    for (const e of g.earthMoon) expect(e.primary).toBe("Earth");
    for (const e of g.jovian) expect(e.primary).toBe("Jupiter");
  });
});

describe("curve plans (honesty rules)", () => {
  it("Aldrin single-ellipse rows get true Kepler curves", () => {
    const e = getEntryById("aldrin-classic-em-k1-outbound")!;
    const plan = curvePlanFor(e);
    expect(plan.kind).toBe("kepler-ellipse");
    if (plan.kind === "kepler-ellipse") {
      expect(plan.aAu).toBe(e.orbit_elements.a_au);
      expect(plan.e).toBe(e.orbit_elements.e);
      expect(plan.fidelity).toContain("sourced (a, e)");
    }
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
