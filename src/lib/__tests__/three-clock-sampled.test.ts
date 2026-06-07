import { describe, it, expect } from "vitest";
import {
  sampledStateAt,
  sampledSpanDays,
  firstNonMonotonicIndex,
} from "../three-clock-sampled";
import type { SampledTrajectory } from "../three-types";

const SEC_PER_DAY = 86_400;

// A tiny 3-sample ramp: t = 0, 1, 2 days; position walks +1 in x each day, with
// a y/z component so all three axes are exercised by the interpolation.
const ramp: SampledTrajectory = {
  kind: "sampled",
  timesSec: [0, 1 * SEC_PER_DAY, 2 * SEC_PER_DAY],
  positionsAU: [
    [0, 0, 0],
    [1, 2, -1],
    [2, 4, -2],
  ],
  frame: "eclipJ2000",
  fidelity: "test ramp",
  provenance: "unit test",
};

describe("sampledStateAt — endpoints return exact stored samples", () => {
  it("returns the first sample at t0", () => {
    expect(sampledStateAt(ramp, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it("returns the last sample at t1", () => {
    expect(sampledStateAt(ramp, 2)).toEqual({ x: 2, y: 4, z: -2 });
  });
  it("returns an interior stored sample exactly at its time", () => {
    expect(sampledStateAt(ramp, 1)).toEqual({ x: 1, y: 2, z: -1 });
  });
});

describe("sampledStateAt — linear interpolation between samples", () => {
  it("midpoint of the first segment is the average of its endpoints", () => {
    const p = sampledStateAt(ramp, 0.5);
    expect(p.x).toBeCloseTo(0.5, 12);
    expect(p.y).toBeCloseTo(1, 12);
    expect(p.z).toBeCloseTo(-0.5, 12);
  });
  it("quarter point of the second segment", () => {
    const p = sampledStateAt(ramp, 1.25);
    expect(p.x).toBeCloseTo(1.25, 12);
    expect(p.y).toBeCloseTo(2.5, 12);
    expect(p.z).toBeCloseTo(-1.25, 12);
  });
});

describe("sampledStateAt — clamping outside the span (never extrapolate)", () => {
  it("clamps to the first sample before t0", () => {
    expect(sampledStateAt(ramp, -10)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it("clamps to the last sample after t1", () => {
    expect(sampledStateAt(ramp, 99)).toEqual({ x: 2, y: 4, z: -2 });
  });
});

describe("sampledStateAt — degenerate inputs", () => {
  it("returns origin for an empty series", () => {
    const empty: SampledTrajectory = { ...ramp, timesSec: [], positionsAU: [] };
    expect(sampledStateAt(empty, 5)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it("returns the single sample for a one-point series at any time", () => {
    const one: SampledTrajectory = {
      ...ramp,
      timesSec: [5 * SEC_PER_DAY],
      positionsAU: [[7, 8, 9]],
    };
    expect(sampledStateAt(one, 0)).toEqual({ x: 7, y: 8, z: 9 });
    expect(sampledStateAt(one, 100)).toEqual({ x: 7, y: 8, z: 9 });
  });
});

describe("sampledSpanDays", () => {
  it("converts the first/last sample seconds to days", () => {
    expect(sampledSpanDays(ramp)).toEqual({ t0: 0, t1: 2 });
  });
  it("returns a zero span for an empty series", () => {
    expect(sampledSpanDays({ ...ramp, timesSec: [], positionsAU: [] })).toEqual({ t0: 0, t1: 0 });
  });
});

describe("firstNonMonotonicIndex (monotonic-time precondition)", () => {
  it("returns -1 for strictly increasing times", () => {
    expect(firstNonMonotonicIndex(ramp)).toBe(-1);
  });
  it("flags the first equal step", () => {
    const flat: SampledTrajectory = {
      ...ramp,
      timesSec: [0, SEC_PER_DAY, SEC_PER_DAY],
    };
    expect(firstNonMonotonicIndex(flat)).toBe(2);
  });
  it("flags the first decreasing step", () => {
    const back: SampledTrajectory = {
      ...ramp,
      timesSec: [0, 2 * SEC_PER_DAY, 1 * SEC_PER_DAY],
    };
    expect(firstNonMonotonicIndex(back)).toBe(2);
  });
});
