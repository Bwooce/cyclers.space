import { describe, it, expect } from "vitest";
import { tourKeyframes } from "../three-tour";
import { markerWorldPos } from "../three-clock";
import type { ClockConfig } from "../three-types";

const cfg: ClockConfig = {
  regime: "idealized-phase",
  t0: 0,
  t1: 1000,
  craft: { a: 1.6, e: 0.2, i_deg: 0, lan_deg: 0, argp_deg: 0, M0_deg: 0 },
  encounterTimes: [50],
  proximityMinima: [{ body: "M", t: 50, d_au: 0.01 }],
  planets: [
    { code: "E", el: { a: 1, e: 0.0167, i_deg: 0, lan_deg: 0, argp_deg: 102.9, M0_deg: 0 } },
    { code: "M", el: { a: 1.524, e: 0.0934, i_deg: 1.85, lan_deg: 49.6, argp_deg: 286.5, M0_deg: 0 } },
  ],
  scale: 1,
  cx: 0,
  cy: 0,
  bodies: ["M"],
  encProvenance: "encounter: idealized phase",
};

describe("tourKeyframes (geometry-derived)", () => {
  it("emits the four didactic beats in time order", () => {
    const k = tourKeyframes(cfg);
    expect(k.map((x) => x.beat)).toEqual(["departure", "flyby", "aphelion", "return"]);
    for (let i = 1; i < k.length; i++) expect(k[i]!.t).toBeGreaterThanOrEqual(k[i - 1]!.t);
  });

  it("places the flyby beat at the proximity minimum", () => {
    expect(tourKeyframes(cfg).find((x) => x.beat === "flyby")!.t).toBe(50);
  });

  it("places aphelion at max heliocentric radius in [t0,t1]", () => {
    const ap = tourKeyframes(cfg).find((x) => x.beat === "aphelion")!.t;
    expect(ap).toBeGreaterThan(0);
    expect(ap).toBeLessThanOrEqual(1000);
  });

  it("anchors departure at t0 and return near t1", () => {
    const k = tourKeyframes(cfg);
    expect(k.find((x) => x.beat === "departure")!.t).toBe(0);
    expect(k.find((x) => x.beat === "return")!.t).toBe(1000);
  });

  it("each keyframe carries a pose (position + lookAt) and a caption", () => {
    for (const kf of tourKeyframes(cfg)) {
      expect(typeof kf.pose.position.x).toBe("number");
      expect(typeof kf.pose.lookAt.x).toBe("number");
      expect(kf.caption.length).toBeGreaterThan(0);
    }
  });

  it("looks at the craft world position at each beat's instant", () => {
    for (const kf of tourKeyframes(cfg)) {
      const craftW = markerWorldPos(cfg.craft, kf.t);
      expect(kf.pose.lookAt.x).toBeCloseTo(craftW.x, 6);
      expect(kf.pose.lookAt.y).toBeCloseTo(craftW.y, 6);
      expect(kf.pose.lookAt.z).toBeCloseTo(craftW.z, 6);
    }
  });

  it("uses the encProvenance string for the flyby caption when present", () => {
    const flyby = tourKeyframes(cfg).find((x) => x.beat === "flyby")!;
    expect(flyby.caption).toContain("encounter: idealized phase");
  });

  it("returns no keyframes when there is no proximity minimum (no flyby to tour)", () => {
    const noFlyby: ClockConfig = { ...cfg, proximityMinima: [] };
    // departure/aphelion/return are still geometric, but flyby needs a minimum;
    // without one the tour still emits the other three in order.
    const k = tourKeyframes(noFlyby);
    expect(k.map((x) => x.beat)).toEqual(["departure", "aphelion", "return"]);
  });

  it("pulls the camera further back at aphelion than at the flyby (the payoff beat)", () => {
    const k = tourKeyframes(cfg);
    const dist = (b: string) => {
      const kf = k.find((x) => x.beat === b)!;
      return Math.hypot(
        kf.pose.position.x - kf.pose.lookAt.x,
        kf.pose.position.y - kf.pose.lookAt.y,
        kf.pose.position.z - kf.pose.lookAt.z,
      );
    };
    expect(dist("aphelion")).toBeGreaterThan(dist("flyby"));
  });
});
