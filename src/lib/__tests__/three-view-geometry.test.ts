import { describe, it, expect } from "vitest";
import {
  buildOrbitLinePoints,
  buildCraftPathPoints,
  buildSampledPathPoints,
  buildSampledSvgPath,
} from "../three-geometry";
import { samplePlanetEllipse } from "../orbit";
import { toThree } from "../three-axis";
import type { ClockConfig, SampledTrajectory } from "../three-types";

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

describe("buildSampledPathPoints / buildSampledSvgPath (viz-2c sampled craft)", () => {
  const sampled: SampledTrajectory = {
    kind: "sampled",
    timesSec: [0, 86_400, 172_800],
    positionsAU: [
      [1, 0, 0],
      [0, 1, 0.5],
      [-1, 0, 0],
    ],
    frame: "eclipJ2000",
    fidelity: "test",
    provenance: "test",
  };

  it("maps every stored sample through toThree (one point per sample)", () => {
    const pts = buildSampledPathPoints(sampled);
    expect(pts.length).toBe(3);
    const exp = toThree({ x: 0, y: 1, z: 0.5 });
    expect(pts[1]!.x).toBeCloseTo(exp.x, 12);
    expect(pts[1]!.y).toBeCloseTo(exp.y, 12);
    expect(pts[1]!.z).toBeCloseTo(exp.z, 12);
  });

  it("SVG path uses ecliptic x/y with px/AU scale + centre (M then L per point)", () => {
    const d = buildSampledSvgPath(sampled, 10, 100, 100);
    // first point (1,0) -> M(100+10) (100-0); second (0,1) -> L(100) (90).
    expect(d.startsWith("M110.00 100.00")).toBe(true);
    expect(d).toContain("L100.00 90.00");
    // one M + (n-1) L commands for n points.
    expect((d.match(/[ML]/g) ?? []).length).toBe(3);
  });

  it("returns empty string for an empty sampled series", () => {
    expect(buildSampledSvgPath({ ...sampled, positionsAU: [], timesSec: [] }, 1, 0, 0)).toBe("");
  });
});
