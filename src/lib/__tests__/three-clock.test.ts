import { describe, it, expect } from "vitest";
import { markerWorldPos, defaultStartTime } from "../three-clock";
import { stateAt } from "../kepler-time";
import { toThree } from "../three-axis";
import type { ClockConfig } from "../three-types";

const craft = { a: 1.6, e: 0.393, i_deg: 0, lan_deg: 0, argp_deg: 0, M0_deg: 0 };

describe("markerWorldPos = toThree(stateAt(el, t))", () => {
  it("round-trips a fixture craft at t0", () => {
    const t0 = 12.5;
    const expected = toThree(stateAt(craft, t0));
    expect(markerWorldPos(craft, t0)).toEqual(expected);
  });
});

describe("defaultStartTime (paused at first encounter)", () => {
  it("uses encounterTimes[0] when present", () => {
    const cfg = { t0: -100, t1: 600, encounterTimes: [42, 99] } as ClockConfig;
    expect(defaultStartTime(cfg)).toBe(42);
  });
  it("falls back to t0 when no encounter times", () => {
    const cfg = { t0: -100, t1: 600 } as ClockConfig;
    expect(defaultStartTime(cfg)).toBe(-100);
  });
  it("falls back to t0 when encounterTimes is empty", () => {
    const cfg = { t0: 7, t1: 600, encounterTimes: [] } as unknown as ClockConfig;
    expect(defaultStartTime(cfg)).toBe(7);
  });
});
