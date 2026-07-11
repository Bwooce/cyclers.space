import { describe, it, expect } from "vitest";
import {
  URANUS_MU_KM3S2,
  URANUS_MOONS,
  orderedMoonPairs,
  meanMotionDegPerDayAbout,
  hohmannElements,
  hohmannArcPoints,
  azimuthForPairIndex,
} from "../uranus-scene";

// Pure geometry for the Uranian moon-pair quasi-cycler hero scene (2026-07,
// #558-#569 family writeback). Sourced constants + Hohmann-transfer math, no
// three import — testable in node exactly like cr3bp-propagate/kepler-time.

describe("Uranian moon constants", () => {
  it("carries the four non-Miranda moons with real sourced semi-major axes", () => {
    // Sourced JPL SSD satellite orbital tables, the SAME values as
    // cyclerfinder.core.satellites.py SATELLITES (independently transcribed
    // here, not computed by this repo's own code — non-circular).
    expect(URANUS_MOONS.Ariel?.smaKm).toBe(190929.0);
    expect(URANUS_MOONS.Umbriel?.smaKm).toBe(265986.0);
    expect(URANUS_MOONS.Titania?.smaKm).toBe(436298.0);
    expect(URANUS_MOONS.Oberon?.smaKm).toBe(583511.0);
  });

  it("mean motion reproduces the published sidereal periods (days)", () => {
    // Published sidereal periods (NASA/JPL planetary satellite fact sheet):
    // Ariel 2.520 d, Umbriel 4.144 d, Titania 8.706 d, Oberon 13.463 d.
    // meanMotionDegPerDayAbout is Kepler III from the SAME sourced (a, mu) —
    // reproducing the independently-published period is the honesty check.
    const periodDays = (smaKm: number) => 360 / meanMotionDegPerDayAbout(smaKm, URANUS_MU_KM3S2);
    expect(periodDays(URANUS_MOONS.Ariel!.smaKm)).toBeCloseTo(2.52, 1);
    expect(periodDays(URANUS_MOONS.Umbriel!.smaKm)).toBeCloseTo(4.144, 1);
    expect(periodDays(URANUS_MOONS.Titania!.smaKm)).toBeCloseTo(8.706, 1);
    expect(periodDays(URANUS_MOONS.Oberon!.smaKm)).toBeCloseTo(13.463, 1);
  });
});

describe("orderedMoonPairs", () => {
  it("enumerates exactly the six 2-combinations of the four moons", () => {
    const pairs = orderedMoonPairs();
    expect(pairs).toHaveLength(6);
    const asSets = pairs.map((p) => [...p].sort().join("-"));
    expect(new Set(asSets).size).toBe(6);
    for (const [a, b] of pairs) {
      expect(URANUS_MOONS[a]).toBeDefined();
      expect(URANUS_MOONS[b]).toBeDefined();
    }
  });

  it("is deterministic (stable sort by inner then outer radius)", () => {
    expect(orderedMoonPairs()).toEqual(orderedMoonPairs());
    expect(orderedMoonPairs()[0]).toEqual(["Ariel", "Umbriel"]); // closest pair
  });
});

describe("hohmannElements", () => {
  it("equal radii collapse to a circle (e=0)", () => {
    const el = hohmannElements(200000, 200000);
    expect(el.e).toBe(0);
    expect(el.aKm).toBe(200000);
  });

  it("matches the analytic Hohmann formula for a 2x radius ratio", () => {
    const el = hohmannElements(100000, 200000);
    expect(el.aKm).toBeCloseTo(150000, 6); // (r1+r2)/2
    expect(el.e).toBeCloseTo(1 / 3, 6); // (r2-r1)/(r2+r1)
    expect(el.aIsPeriapsis).toBe(true);
  });

  it("is symmetric in argument order (same ellipse either way)", () => {
    const a = hohmannElements(100000, 583511);
    const b = hohmannElements(583511, 100000);
    expect(a.aKm).toBeCloseTo(b.aKm, 6);
    expect(a.e).toBeCloseTo(b.e, 6);
    expect(a.aIsPeriapsis).toBe(true);
    expect(b.aIsPeriapsis).toBe(false);
  });
});

describe("hohmannArcPoints", () => {
  it("both endpoints land exactly on the two source radii", () => {
    const el = hohmannElements(190929, 583511); // Ariel <-> Oberon
    const pts = hohmannArcPoints(el, 0, 200);
    const r0 = Math.hypot(pts[0]!.x, pts[0]!.y);
    const r1 = Math.hypot(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
    expect(r0).toBeCloseTo(190929, 3); // periapsis = inner moon
    expect(r1).toBeCloseTo(583511, 3); // apoapsis = outer moon
  });

  it("periapsis sits at the given azimuth", () => {
    const el = hohmannElements(190929, 265986);
    const pts = hohmannArcPoints(el, 90, 4);
    // nu=0 point is periapsis, placed at azimuth 90deg -> (0, r).
    expect(pts[0]!.x).toBeCloseTo(0, 6);
    expect(pts[0]!.y).toBeCloseTo(190929, 3);
  });

  it("contains no NaN for every real moon pair", () => {
    for (const [a, b] of orderedMoonPairs()) {
      const el = hohmannElements(URANUS_MOONS[a]!.smaKm, URANUS_MOONS[b]!.smaKm);
      for (const p of hohmannArcPoints(el, 37)) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });
});

describe("azimuthForPairIndex", () => {
  it("fans the six pairs out to six distinct azimuths", () => {
    const azimuths = [0, 1, 2, 3, 4, 5].map((i) => azimuthForPairIndex(i));
    expect(new Set(azimuths).size).toBe(6);
    expect(azimuths[0]).toBe(0);
    expect(azimuths[1]).toBe(60);
  });
});
