import { describe, it, expect } from "vitest";
import { buildHeroScenes, heroSummary } from "../hero-scenes";
import { reproducedCount } from "../hero-data";

// Scene specs (task #227): one JSON-serialisable source consumed by both the
// poster and the gallery. The honesty invariants live here — every row of
// the V1+ filter is represented (curve or badge), captions are computed from
// the data, and badge scenes carry no curves.

describe("hero scene specs", () => {
  const scenes = buildHeroScenes();

  it("represents every reproduced row exactly once (curves + badges = filter)", () => {
    const total = scenes.reduce((n, s) => n + s.rowCount, 0);
    expect(total).toBe(reproducedCount());
    for (const s of scenes) {
      expect(s.curves.length + s.badges.length).toBe(s.rowCount);
    }
  });

  it("is JSON-serialisable without loss (the inline-island contract)", () => {
    expect(JSON.parse(JSON.stringify(scenes))).toEqual(scenes);
  });

  it("heliocentric scene: Kepler curves + honest aphelion rings + planet bodies", () => {
    const s = scenes.find((x) => x.id === "heliocentric")!;
    expect(s).toBeDefined();
    // Which heliocentric CURVES render is data-dependent and NOT hard-required:
    // the Aldrin Earth-Mars cyclers that used to supply the Kepler ellipse had
    // their top-level (a,e) retired upstream (main repo #368: the (1.60, 0.393)
    // pair is figure-read, not a sourced literal), and the four-class migration
    // shifted which rows land in this group. Honesty-over-prettiness: a row with
    // no sourced (a,e) becomes a badge, never a fabricated curve — so the scene
    // may legitimately show only planets + badges. The invariant we DO assert:
    // any curve/ring that renders carries an honest fidelity string.
    for (const c of s.curves) {
      if (c.geom.kind === "ring") expect(c.fidelity).toContain("max-aphelion ring only");
      if (c.geom.kind === "kepler-ellipse") expect(c.fidelity).toContain("sourced (a, e)");
    }
    expect(s.bodies.some((b) => b.kind === "star")).toBe(true);
    expect(s.bodies.filter((b) => b.el).length).toBeGreaterThanOrEqual(2); // Earth + Mars
    expect(s.captionLines.join(" ")).toContain("idealized phase");
  });

  it("earth-moon scene: all curves are CR3BP with rotating-frame provenance", () => {
    const s = scenes.find((x) => x.id === "earth-moon")!;
    expect(s).toBeDefined();
    expect(s.curves.length).toBeGreaterThanOrEqual(5);
    for (const c of s.curves) {
      expect(c.geom.kind).toBe("cr3bp");
      expect(c.fidelity).toContain("derived upstream");
      if (c.geom.kind === "cr3bp") expect(c.geom.periodDays).toBeGreaterThan(0);
    }
    expect(s.bodies.map((b) => b.name).sort()).toEqual(["Earth", "Moon"]);
    expect(s.captionLines.join(" ")).toContain("rotating frame");
  });

  it("jovian scene: badges only, zero curves, honesty caption says so", () => {
    const s = scenes.find((x) => x.id === "jovian")!;
    expect(s).toBeDefined();
    expect(s.curves).toHaveLength(0);
    expect(s.badges.length).toBeGreaterThanOrEqual(3);
    expect(s.captionLines.join(" ")).toContain("no curve is drawn");
  });

  it("heroSummary count matches the live filter", () => {
    expect(heroSummary().count).toBe(reproducedCount());
  });
});
