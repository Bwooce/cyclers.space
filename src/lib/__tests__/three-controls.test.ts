import { describe, it, expect } from "vitest";
import { frameRadiusAU, cameraPoseFromSpherical } from "../three-controls-math";
import type { ClockConfig } from "../three-types";

const cfg: ClockConfig = {
  regime: "idealized-phase",
  t0: 0,
  t1: 1000,
  craft: { a: 1.6, e: 0.393, i_deg: 0, lan_deg: 0, argp_deg: 0, M0_deg: 0 },
  planets: [{ code: "E", el: { a: 1, e: 0.0167, i_deg: 0, lan_deg: 0, argp_deg: 102.9, M0_deg: 0 } }],
  scale: 1,
  cx: 0,
  cy: 0,
  bodies: ["E"],
};

describe("frameRadiusAU (camera framed to the trajectory aphelion)", () => {
  it("returns at least the craft aphelion a(1+e)", () => {
    const aphelion = cfg.craft.a * (1 + cfg.craft.e); // 1.6 * 1.393 = 2.2288
    const r = frameRadiusAU(cfg);
    // The camera radius must be >= aphelion (so the whole orbit fits) and within
    // a sane multiple of it.
    expect(r).toBeGreaterThanOrEqual(aphelion);
    expect(r).toBeLessThan(aphelion * 6);
  });
});

describe("cameraPoseFromSpherical (spherical -> Three world coords)", () => {
  it("looks straight down (+Y) at elevation = +90 deg", () => {
    const p = cameraPoseFromSpherical(10, 0, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(10, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });
  it("sits in the ecliptic plane (y=0) at elevation = 0", () => {
    const p = cameraPoseFromSpherical(10, 0, 0);
    expect(p.y).toBeCloseTo(0, 6);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(10, 6);
  });
  it("preserves radius for arbitrary angles", () => {
    const p = cameraPoseFromSpherical(7, 1.1, 0.4);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(7, 6);
  });
});
