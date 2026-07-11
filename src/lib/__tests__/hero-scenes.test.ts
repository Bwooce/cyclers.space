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

  // Earth-Moon split (2026-07 follow-up to #227): the single 9-curve panel
  // overlaid a figure-8, a 3-petal cycler, and the whole Ross-RT/Braik-Ross
  // resonant sweep in one tangled scene. It is now three family-grouped
  // sub-scenes (earthMoonGroupOf's id-prefix partition in hero-scenes.ts).
  // Today's live V1+ data: the "landmark" bucket (Arenstorf figure-8,
  // Genova-Aldrin 3-petal) is V0-only and so contributes NO rows to the
  // hero filter yet -- that sub-scene legitimately renders nothing today
  // (same "omit empty groups" convention as every other scene) and will
  // appear automatically once one of those rows is promoted off V0.
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

  it("earth-moon-landmark scene: absent today (Arenstorf/Genova-Aldrin are V0-only, filtered out upstream by the V1+ hero filter -- verified directly, not assumed)", () => {
    expect(scenes.find((x) => x.id === "earth-moon-landmark")).toBeUndefined();
  });

  it("every earth-moon-* scene together carries exactly the live Earth-Moon V1+ rows (6 Ross-RT + 3 Braik-Ross today)", () => {
    const emScenes = scenes.filter((s) => s.id.startsWith("earth-moon-"));
    const total = emScenes.reduce((n, s) => n + s.rowCount, 0);
    expect(total).toBe(9);
  });

  it("uranian scene: leads the array and carries all six representative arcs", () => {
    expect(scenes[0]?.id).toBe("uranian");
    const s = scenes.find((x) => x.id === "uranian")!;
    expect(s).toBeDefined();
    expect(s.curves.length + s.badges.length).toBe(6);
    expect(s.curves.length).toBe(6); // all six rows resolve real moon pairs
    for (const c of s.curves) {
      expect(c.geom.kind).toBe("uranian-transfer");
      // Plain-language lead (task: caption "technically correct but sucks"
      // rewrite) comes first, naming the moon pair and translating the
      // synodic timing + validity window into accessible language...
      expect(c.fidelity).toMatch(/^A quasi-cyclic transfer between \S+ and \S+: recurs roughly every/);
      expect(c.fidelity).toMatch(/flyable about [\d.]+% of each cycle, valid \d{4}–\d{4}/);
      if (c.geom.kind === "uranian-transfer") {
        expect(c.fidelity).toContain(c.geom.moonA);
        expect(c.fidelity).toContain(c.geom.moonB);
      }
      // ...then the existing technical fidelity/honesty disclosure survives
      // as a clearly-secondary continuation (the 3c79bd9 honesty binding:
      // every curve still names its idealized-proxy status and the row's
      // real invariants).
      expect(c.fidelity).toContain("Technical detail: idealized");
      expect(c.fidelity).toContain("NOT the row's actual computed arc");
      if (c.geom.kind === "uranian-transfer") {
        expect(c.geom.smaAKm).toBeGreaterThan(0);
        expect(c.geom.smaBKm).toBeGreaterThan(0);
        expect(c.geom.e).toBeGreaterThanOrEqual(0);
        expect(c.geom.e).toBeLessThan(1);
      }
    }
    // Six distinct azimuths (one per moon-pair direction) -- visually separated.
    const azimuths = s.curves.map((c) => (c.geom.kind === "uranian-transfer" ? c.geom.azimuthDeg : -1));
    expect(new Set(azimuths).size).toBe(6);
    // Uranus + the four moons, all coplanar (i=0) with a real sourced sma.
    expect(s.bodies.find((b) => b.name === "Uranus")?.kind).toBe("star");
    const moons = s.bodies.filter((b) => b.kind === "moon");
    expect(moons.map((b) => b.name).sort()).toEqual(["Ariel", "Oberon", "Titania", "Umbriel"]);
    for (const m of moons) {
      expect(m.el?.e).toBe(0);
      expect(m.el?.i_deg).toBe(0);
      expect(m.el?.a).toBeGreaterThan(0);
    }
    expect(s.captionLines.join(" ")).toContain("down the Uranian pole");
    expect(s.captionLines.join(" ")).toContain("NOT the row's real arc");
    expect(s.captionLines.join(" ")).toContain("V4");
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
