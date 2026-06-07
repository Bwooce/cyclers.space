import { describe, it, expect } from "vitest";
import { captionLines } from "../three-caption";
import type { ClockConfig, SampledTrajectory } from "../three-types";

const base = {
  regime: "idealized-phase",
  t0: 0,
  t1: 100,
  craft: { a: 1.6, e: 0.39, i_deg: 0, lan_deg: 0, argp_deg: 0, M0_deg: 0 },
  planets: [],
  scale: 1,
  cx: 0,
  cy: 0,
  bodies: [],
  fidelityBadge: "spacecraft: idealized coplanar ellipse",
  clockLabel: "clock: idealized phase clock (no epoch)",
  encProvenance: "encounters: time-true on the idealized phase clock",
  planetCitation: "Standish (1992) mean elements",
} as ClockConfig;

const sampled: SampledTrajectory = {
  kind: "sampled",
  timesSec: [0, 1],
  positionsAU: [[1, 0, 0], [1, 0, 0]],
  frame: "eclipJ2000",
  fidelity: "synthetic demo (Kepler ellipse resampled)",
  provenance: "dev fixture: NOT n-body",
};

describe("captionLines — analytic craft (2b behaviour preserved)", () => {
  const lines = captionLines(base);
  it("keeps the analytic spacecraft badge", () => {
    expect(lines).toContain("spacecraft: idealized coplanar ellipse");
  });
  it("states planets are Standish osculating ellipses", () => {
    expect(lines.some((l) => /planets: Standish osculating ellipses/.test(l))).toBe(true);
  });
  it("carries the clock + encounter provenance", () => {
    expect(lines).toContain("clock: idealized phase clock (no epoch)");
    expect(lines.some((l) => /encounters: time-true/.test(l))).toBe(true);
  });
  it("does NOT mention a sampled craft", () => {
    expect(lines.some((l) => /craft: sampled/.test(l))).toBe(false);
  });
});

describe("captionLines — sampled craft (viz-2c per-curve honesty)", () => {
  const lines = captionLines({ ...base, craftSampled: sampled });
  it("names the sampled craft model + provenance", () => {
    expect(lines).toContain("craft: sampled — synthetic demo (Kepler ellipse resampled)");
    expect(lines).toContain("craft samples: dev fixture: NOT n-body");
  });
  it("STILL states planets are Standish osculating ellipses (no fidelity blur)", () => {
    expect(lines.some((l) => /planets: Standish osculating ellipses/.test(l))).toBe(true);
  });
  it("does not drop the analytic badge (we add, never remove)", () => {
    expect(lines).toContain("spacecraft: idealized coplanar ellipse");
  });
  it("retains the encounter-marker provenance line", () => {
    expect(lines.some((l) => /encounters: time-true/.test(l))).toBe(true);
  });
});

describe("captionLines — falls back to default citation when none supplied", () => {
  it("uses PLANET_GEOMETRY_CITATION when planetCitation absent", () => {
    const { planetCitation, ...noCite } = base;
    void planetCitation;
    const lines = captionLines(noCite as ClockConfig);
    expect(lines.some((l) => /planets: Standish osculating ellipses/.test(l))).toBe(true);
  });
});
