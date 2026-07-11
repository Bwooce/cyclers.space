import { describe, it, expect } from "vitest";
import { cyclableScenes, palette, MOON_MARKER_COLOR, CURVE_COLORS } from "../hero-gallery";
import { buildHeroScenes } from "../hero-scenes";
import type { HeroSceneSpec } from "../hero-scenes";

// #hero-gallery-badge-cycling: badge-only scenes (curves.length===0 — Jovian
// triple cyclers, Other systems) are honest as a static poster badge panel
// but render as an empty, unmoving canvas with a lone marker in the animated
// 3D gallery, which reads as broken rather than "no data". cyclableScenes()
// is the pure (no three.js) filter the gallery applies before building/
// cycling scenes; hero-scenes.ts's buildHeroScenes() itself must keep
// returning every scene (poster + headline count still need the full set).

function fixture(id: HeroSceneSpec["id"], curveCount: number): HeroSceneSpec {
  return {
    id,
    title: id,
    frameLabel: "test",
    curves: Array.from({ length: curveCount }, (_, i) => ({
      id: `${id}-curve-${i}`,
      label: `curve ${i}`,
      tier: "V1",
      fidelity: "test",
      geom: { kind: "ring", radiusAu: 1 },
    })),
    bodies: [],
    badges: [],
    captionLines: [],
    rowCount: curveCount,
  };
}

describe("cyclableScenes", () => {
  it("excludes badge-only scenes (curves.length === 0) from the cyclable set", () => {
    const scenes = [fixture("heliocentric", 3), fixture("jovian", 0), fixture("other", 0)];
    const result = cyclableScenes(scenes);
    expect(result.map((s) => s.id)).toEqual(["heliocentric"]);
  });

  it("keeps every scene that has at least one curve", () => {
    const scenes = [fixture("uranian", 6), fixture("heliocentric", 2), fixture("earth-moon", 5)];
    const result = cyclableScenes(scenes);
    expect(result).toHaveLength(3);
  });

  it("falls back to the full list if every scene is badge-only (degenerate case)", () => {
    const scenes = [fixture("jovian", 0), fixture("other", 0)];
    const result = cyclableScenes(scenes);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array only when given an empty array (no crash)", () => {
    expect(cyclableScenes([])).toEqual([]);
  });

  it("on the real (live) hero scenes: jovian and other are excluded, and every survivor has curves", () => {
    const scenes = buildHeroScenes();
    const result = cyclableScenes(scenes);
    // Today's data: jovian and other are always badge-only per hero-scenes.ts.
    expect(result.some((s) => s.id === "jovian")).toBe(false);
    expect(result.some((s) => s.id === "other")).toBe(false);
    for (const s of result) {
      expect(s.curves.length).toBeGreaterThan(0);
    }
    // The full (unfiltered) source still carries jovian/other for the poster
    // and the headline "N reproduced" count — the invariant this fix must not
    // break.
    expect(scenes.some((s) => s.id === "jovian")).toBe(true);
    expect(scenes.length).toBeGreaterThan(result.length);
  });
});

// Regression test for the Uranian-scene "no moving satellites" bug: the moon
// reference-orbit ring and the moving marker riding it used to share the
// same `col.moon` gray, so the moving dot camouflaged against its own track
// (buildUranian in hero-gallery.ts). MOON_MARKER_COLOR must differ from
// col.moon in BOTH themes, and from every discovery-curve colour, so this
// class of "the moving thing is invisible" bug can't silently recur.
describe("MOON_MARKER_COLOR (moving-marker visibility regression)", () => {
  it("differs from the moon reference-orbit ring colour in both themes", () => {
    expect(MOON_MARKER_COLOR).not.toBe(palette(true).moon);
    expect(MOON_MARKER_COLOR).not.toBe(palette(false).moon);
  });

  it("differs from every discovery-curve colour", () => {
    for (const c of CURVE_COLORS) {
      expect(MOON_MARKER_COLOR).not.toBe(c);
    }
  });
});
