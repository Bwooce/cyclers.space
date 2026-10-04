import { describe, it, expect } from "vitest";
import { buildHeroScenes, earthMoonGroupOf, heroSummary } from "../hero-scenes";
import type { EarthMoonGroup } from "../hero-scenes";
import { heroGroups, reproducedCount } from "../hero-data";

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

  // Earth-Moon split (2026-07 follow-up to #227; widened 2026-09-07): the
  // single 9-curve panel overlaid a figure-8, a 3-petal cycler, and the whole
  // Ross-RT/Braik-Ross resonant sweep in one tangled scene. It is now
  // family-grouped sub-scenes (earthMoonGroupOf's id-prefix partition in
  // hero-scenes.ts). Which groups are populated is derived from the live
  // catalogue below, never pinned: an upstream promotion or a new family row
  // must not break the site build (2026-08-31 -> 2026-09-07 the deploy was
  // blocked for a week by a hard-coded "9 rows, no landmark scene" pin after
  // the Casoliva/Vaquero families landed at V1 upstream).
  function checkEarthMoonSubScene(id: string, curveCountLowerBound: number) {
    const s = scenes.find((x) => x.id === id)!;
    expect(s).toBeDefined();
    expect(s.curves.length).toBeGreaterThanOrEqual(curveCountLowerBound);
    for (const c of s.curves) {
      expect(c.geom.kind).toBe("cr3bp");
      expect(c.fidelity).toContain("derived upstream");
      if (c.geom.kind === "cr3bp") expect(c.geom.periodDays).toBeGreaterThan(0);
    }
    expect(s.bodies.map((b) => b.name).sort()).toEqual(["Earth", "Moon"]);
    expect(s.captionLines.join(" ")).toContain("rotating frame");
    // Cusp explainer (direct user question this follow-up answers): every
    // Earth-Moon sub-scene caption must carry the "why does this look
    // pointy" pointer, not just the pre-existing fidelity lines.
    expect(s.captionLines.join(" ")).toContain("pointy cusps");
    expect(s.captionLines.join(" ")).toContain("/about/#reading-diagrams");
    return s;
  }

  it("earth-moon-ross-rt scene: the (k,m) resonant family, all CR3BP curves", () => {
    checkEarthMoonSubScene("earth-moon-ross-rt", 5);
  });

  it("earth-moon-braik-ross scene: the Braik-Ross cyclers, all CR3BP curves", () => {
    checkEarthMoonSubScene("earth-moon-braik-ross", 2);
  });

  const EM_GROUP_TO_SCENE: Record<EarthMoonGroup, string> = {
    landmark: "earth-moon-landmark",
    "ross-rt": "earth-moon-ross-rt",
    "braik-ross": "earth-moon-braik-ross",
    casoliva: "earth-moon-casoliva",
    vaquero: "earth-moon-vaquero",
  };

  it("earth-moon sub-scenes: each group's scene exists iff the live V1+ catalogue has rows in it, with exactly that many rows", () => {
    const em = heroGroups().earthMoon;
    for (const [group, id] of Object.entries(EM_GROUP_TO_SCENE) as Array<[EarthMoonGroup, string]>) {
      const rows = em.filter((e) => earthMoonGroupOf(e) === group);
      const s = scenes.find((x) => x.id === id);
      if (rows.length === 0) {
        expect(s, `${id} must be omitted when its group is empty`).toBeUndefined();
      } else {
        expect(s, `${id} must exist for ${rows.length} live row(s)`).toBeDefined();
        expect(s!.rowCount).toBe(rows.length);
        expect([...s!.curves.map((c) => c.id), ...s!.badges.map((b) => b.id)].sort()).toEqual(
          rows.map((e) => e.id).sort(),
        );
      }
    }
  });

  it("every earth-moon-* scene together carries exactly the live Earth-Moon V1+ rows (derived from the catalogue, not pinned)", () => {
    const emScenes = scenes.filter((s) => s.id.startsWith("earth-moon-"));
    const total = emScenes.reduce((n, s) => n + s.rowCount, 0);
    expect(total).toBe(heroGroups().earthMoon.length);
    expect(total).toBeGreaterThan(0);
  });

  it("earth-moon-casoliva / earth-moon-vaquero scenes: CR3BP curves when their families are live (they are today, at V1)", () => {
    for (const id of ["earth-moon-casoliva", "earth-moon-vaquero"]) {
      if (scenes.some((x) => x.id === id)) checkEarthMoonSubScene(id, 1);
    }
  });

  it("has no uranian scene: the Uranian quasi-cycler and torus rows were withdrawn upstream", () => {
    // 2026-10-04: the six moon-pair quasi-cycler rows were withdrawn (a
    // turn-angle check showed they are not ballistic trajectories), and the
    // torus_homoclinic row the day before. The scene is data-driven, so it
    // disappears with its rows; it must not be drawn from stale data.
    expect(scenes.find((x) => x.id === "uranian")).toBeUndefined();
    for (const sc of scenes) {
      for (const c of sc.curves) expect(c.geom.kind).not.toBe("uranian-transfer");
    }
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
