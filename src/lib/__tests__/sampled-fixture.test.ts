import { describe, it, expect } from "vitest";
import { makeSampledFixture, FIXTURE_CRAFT } from "../__fixtures__/sampled-fixture";
import { sampledStateAt, firstNonMonotonicIndex } from "../three-clock-sampled";
import { stateAt, periodDays, distance } from "../kepler-time";
import { toThree } from "../three-axis";

// The coincidence regression (slice 2): the synthetic fixture is the SAME orbit
// as the analytic craft, so the sampled renderer (interpolated clock) must
// coincide with the analytic renderer (stateAt). We assert on the projected
// Three-frame points (the exact thing the 3D line and SVG path draw), since
// that is what the user sees coincide.

const fixture = makeSampledFixture();
const P = periodDays(FIXTURE_CRAFT);
const SEC_PER_DAY = 86_400;

describe("makeSampledFixture — well-formed sampled trajectory", () => {
  it("is monotonic in time", () => {
    expect(firstNonMonotonicIndex(fixture)).toBe(-1);
  });
  it("has parallel time/position arrays of equal length (> a few points)", () => {
    expect(fixture.timesSec.length).toBe(fixture.positionsAU.length);
    expect(fixture.timesSec.length).toBeGreaterThan(20);
  });
  it("spans one full period (last sample at t = period)", () => {
    const lastDay = fixture.timesSec[fixture.timesSec.length - 1]! / SEC_PER_DAY;
    expect(lastDay).toBeCloseTo(P, 6);
  });
  it("labels itself synthetic (honesty caption source)", () => {
    expect(fixture.fidelity).toMatch(/synthetic/i);
    expect(fixture.provenance).toMatch(/NOT n-body/);
  });
});

describe("EXACT coincidence at the sampled grid times", () => {
  // At a stored sample time, interpolation returns the stored point, which IS
  // toThree(stateAt) — so the sampled and analytic projected points are
  // bit-identical (the data is the analytic curve). Tolerance: 1e-12 AU.
  it("sampled projected point == analytic projected point at every grid node", () => {
    for (let i = 0; i < fixture.timesSec.length; i++) {
      const tDay = fixture.timesSec[i]! / SEC_PER_DAY;
      const sampled = toThree(sampledStateAt(fixture, tDay));
      const analytic = toThree(stateAt(FIXTURE_CRAFT, tDay));
      expect(sampled.x).toBeCloseTo(analytic.x, 12);
      expect(sampled.y).toBeCloseTo(analytic.y, 12);
      expect(sampled.z).toBeCloseTo(analytic.z, 12);
    }
  });
});

describe("INTERPOLATED coincidence between grid times (chord error bound)", () => {
  // Between samples the linear interpolant is a chord across the ellipse; it
  // departs from the true curve by the chord sag. At the fixture's 5-day step on
  // this ellipse the worst-case projected error is well under 5e-3 AU (~750,000
  // km — a fraction of the curve's ~7.5 AU extent, visually coincident at the
  // line widths we draw). DOCUMENTED TOLERANCE: max projected error < 5e-3 AU.
  it("max projected error over a dense scan stays under 5e-3 AU", () => {
    const N = 2000;
    let maxErr = 0;
    for (let k = 0; k <= N; k++) {
      const tDay = (P * k) / N;
      const sampled = toThree(sampledStateAt(fixture, tDay));
      const analytic = toThree(stateAt(FIXTURE_CRAFT, tDay));
      const err = distance(sampled, analytic);
      if (err > maxErr) maxErr = err;
    }
    expect(maxErr).toBeLessThan(5e-3);
  });
});
