import { describe, it, expect } from "vitest";
import { buildOrbitLinePoints, buildCraftPathPoints } from "../three-geometry";
import { samplePlanetEllipse } from "../orbit";
import { toThree } from "../three-axis";
import type { ClockConfig } from "../three-types";

const cfg: ClockConfig = {
  regime: "idealized-phase",
  t0: 0,
  t1: 1000,
  craft: { a: 1.6, e: 0.393, i_deg: 0, lan_deg: 0, argp_deg: 0, M0_deg: 0 },
  planets: [
    { code: "E", el: { a: 1, e: 0.0167, i_deg: 0, lan_deg: 0, argp_deg: 102.9, M0_deg: 0 } },
    { code: "M", el: { a: 1.5237, e: 0.0934, i_deg: 1.85, lan_deg: 49.56, argp_deg: -73.5, M0_deg: 0 } },
  ],
  scale: 1,
  cx: 0,
  cy: 0,
  bodies: ["E", "M"],
};

describe("buildOrbitLinePoints (planet orbit lines, routed through toThree)", () => {
  it("returns one Three point per sampled ellipse point for each planet", () => {
    const lines = buildOrbitLinePoints(cfg);
    expect(lines.map((l) => l.code)).toEqual(["E", "M"]);
    for (const line of lines) {
      const raw = samplePlanetEllipse(line.code);
      expect(line.points.length).toBe(raw.length);
    }
  });

  it("routes every point through the toThree axis swap", () => {
    const line = buildOrbitLinePoints(cfg).find((l) => l.code === "M")!;
    const raw = samplePlanetEllipse("M");
    // toThree maps ecliptic (x,y,z=0) -> (x, 0, -y); samplePlanetEllipse drops z.
    const expected = toThree({ x: raw[0]!.x, y: raw[0]!.y, z: 0 });
    expect(line.points[0]!.x).toBeCloseTo(expected.x, 9);
    expect(line.points[0]!.y).toBeCloseTo(expected.y, 9);
    expect(line.points[0]!.z).toBeCloseTo(expected.z, 9);
  });
});

describe("buildCraftPathPoints (inked trajectory)", () => {
  it("returns a non-empty closed polyline routed through toThree", () => {
    const pts = buildCraftPathPoints(cfg);
    expect(pts.length).toBeGreaterThan(2);
    // The craft is coplanar here (i=0) so every Three y must be ~0 (ecliptic
    // north maps to y; an in-plane orbit has no north component).
    for (const p of pts) expect(Math.abs(p.y)).toBeLessThan(1e-9);
  });
});
