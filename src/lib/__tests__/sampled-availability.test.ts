import { describe, it, expect } from "vitest";
import { sampledTrajectoryFor, canRenderSampled3D } from "../sampled-availability";
import type { CyclerEntry } from "../types";

// Minimal stand-ins — only the fields the gate reads (cycler_class). The cast
// keeps the test free of the full CyclerEntry shape.
const single = { id: "s", cycler_class: "single-ellipse" } as CyclerEntry;
const multi = { id: "m", cycler_class: "multi-arc" } as CyclerEntry;
const cr3bp = { id: "c", cycler_class: "non-keplerian" } as CyclerEntry;
const defaulted = { id: "d" } as CyclerEntry; // no cycler_class -> single-ellipse

describe("sampledTrajectoryFor — no real producer yet", () => {
  it("returns null for every row until the Phase-C exporter lands", () => {
    for (const e of [single, multi, cr3bp, defaulted]) {
      expect(sampledTrajectoryFor(e)).toBeNull();
    }
  });
});

describe("canRenderSampled3D — gate stays closed without sampled data", () => {
  it("is false for multi-arc (no sampled data published yet)", () => {
    expect(canRenderSampled3D(multi)).toBe(false);
  });
  it("is false for single-ellipse (gate keyed on sampled data, not class)", () => {
    expect(canRenderSampled3D(single)).toBe(false);
  });
  it("is ALWAYS false for CR3BP, even if data appeared (rotating frame)", () => {
    expect(canRenderSampled3D(cr3bp)).toBe(false);
  });
  it("is false for a default-class row", () => {
    expect(canRenderSampled3D(defaulted)).toBe(false);
  });
});
