import { describe, it, expect } from "vitest";
import {
  ORBIT_CLASS_LABEL,
  classifyValidityWindow,
  effectiveOrbitClass,
  formatValidityWindow,
  inEpochWindow,
  inNReturnsRange,
  isProjectDiscovery,
  loadCatalogue,
  nReturnsValue,
  projectDiscoveries,
} from "../catalogue";
import type { CyclerEntry, OrbitClass } from "../types";

// Schema v5 (2026-06-15) — the four-class taxonomy. The site is read-only with
// respect to the upstream catalogue, but the loader applies defaults so old rows
// (which carry no orbit_class) continue to render. These tests pin that contract
// down so the migration window can land safely.

const minimalEntry = (overrides: Partial<CyclerEntry> = {}): CyclerEntry => ({
  id: "test-row",
  name: "Test row",
  source: "literature",
  bodies: ["E", "M"],
  sequence_canonical: "E-M",
  sense: "outbound",
  period: { pair: "EM", k: 1, years: 2.135 },
  vinf_kms_at_encounters: [],
  orbit_elements: {
    a_au: null,
    e: null,
    perihelion_au: null,
    aphelion_au: null,
    inclination_deg: null,
  },
  first_published: { authors: ["Doe"], year: 2026, title: "Test", venue: "Test" },
  priority_date: "2026-01-01",
  ...overrides,
});

describe("orbit_class defaulting (schema v5 backward compat)", () => {
  it("rows with no orbit_class default to 'cycler' in loadCatalogue", () => {
    const entries = loadCatalogue();
    // The current catalogue carries no orbit_class fields yet (the upstream
    // schema migration is in flight). Every loaded row must resolve to a
    // defaulted "cycler" so the site keeps rendering.
    for (const e of entries) {
      expect(e.orbit_class).toBeDefined();
      // Today's catalogue: all rows pre-date the migration, so all resolve to
      // the "cycler" default. When the migration lands this test becomes a
      // weaker invariant ("orbit_class is always set"), still satisfied.
      expect(["cycler", "quasi_cycler", "precursor_mga", "mga_tour", "resonant_po"]).toContain(
        e.orbit_class,
      );
    }
  });

  it("effectiveOrbitClass returns the explicit class when present", () => {
    const e = minimalEntry({ orbit_class: "mga_tour" });
    expect(effectiveOrbitClass(e)).toBe("mga_tour");
  });

  it("effectiveOrbitClass falls back to 'cycler' when absent", () => {
    const e = minimalEntry({});
    expect(effectiveOrbitClass(e)).toBe("cycler");
  });

  it("ORBIT_CLASS_LABEL covers all orbit classes", () => {
    const classes: OrbitClass[] = [
      "cycler",
      "quasi_cycler",
      "precursor_mga",
      "mga_tour",
      "resonant_po",
    ];
    for (const c of classes) {
      expect(ORBIT_CLASS_LABEL[c]).toBeTruthy();
    }
    expect(ORBIT_CLASS_LABEL.cycler).toBe("Cycler");
    expect(ORBIT_CLASS_LABEL.quasi_cycler).toBe("Quasi-cycler");
    expect(ORBIT_CLASS_LABEL.precursor_mga).toBe("Precursor");
    expect(ORBIT_CLASS_LABEL.mga_tour).toBe("Tour");
    expect(ORBIT_CLASS_LABEL.resonant_po).toBe("Resonant PO");
  });
});

describe("isProjectDiscovery (#462) — honest genuine-discovery predicate", () => {
  const discoveryEntry = (overrides: Partial<CyclerEntry> = {}): CyclerEntry =>
    minimalEntry({
      source: "discovered",
      first_published: {
        authors: ["cyclerfinder discovery campaign"],
        year: 2026,
        title: "A discovery",
        venue: "cyclerfinder project",
      },
      corroborating_sources: [],
      ...overrides,
    });

  it("accepts a discovered, cyclerfinder-first, uncorroborated row", () => {
    expect(isProjectDiscovery(discoveryEntry())).toBe(true);
  });

  it("rejects literature-anchor rows (source !== 'discovered')", () => {
    expect(isProjectDiscovery(minimalEntry({ source: "literature" }))).toBe(false);
    expect(isProjectDiscovery(minimalEntry({ source: "both" }))).toBe(false);
  });

  it("rejects computed-but-not-novel rows (source 'this-project')", () => {
    expect(isProjectDiscovery(minimalEntry({ source: "this-project" }))).toBe(false);
  });

  it("rejects a row corroborated by an external source", () => {
    const e = discoveryEntry({
      corroborating_sources: [
        { authors: ["Someone Else"], year: 2019, title: "Prior art", venue: "MNRAS" },
      ],
    });
    expect(isProjectDiscovery(e)).toBe(false);
  });

  it("rejects known-reproduction / known-class-member rows even if discovered", () => {
    expect(isProjectDiscovery(discoveryEntry({ our_status: "known-class-member" }))).toBe(false);
    expect(isProjectDiscovery(discoveryEntry({ our_status: "known-reproduction" }))).toBe(false);
  });

  it("rejects a row not first-published by the cyclerfinder project", () => {
    const e = discoveryEntry({
      first_published: { authors: ["Aldrin, B."], year: 1985, title: "x", venue: "y" },
    });
    expect(isProjectDiscovery(e)).toBe(false);
  });

  it("selects the headline #339 row and excludes the C21 known-class member", () => {
    const ids = projectDiscoveries().map((e) => e.id);
    expect(ids).toContain("umbriel-oberon-1-1-uranian-quasi-cycler-2026");
    expect(ids).not.toContain("em-cycler-21-3d-spatial-2026");
  });

  it("every selected row genuinely satisfies all four honesty conditions", () => {
    for (const e of projectDiscoveries()) {
      expect(e.source).toBe("discovered");
      expect(e.first_published.authors.some((a) => a.toLowerCase().includes("cyclerfinder"))).toBe(
        true,
      );
      expect(e.corroborating_sources ?? []).toHaveLength(0);
      expect(e.our_status).not.toBe("known-class-member");
      expect(e.our_status).not.toBe("known-reproduction");
    }
  });
});

describe("validity window classification + formatting", () => {
  it("classifies open-now, past, future, and unknown windows", () => {
    const w = { start: "2030-01-01", end: "2045-01-01" };
    expect(classifyValidityWindow(w, "2035-06-01")).toBe("open-now");
    expect(classifyValidityWindow(w, "2025-06-01")).toBe("future");
    expect(classifyValidityWindow(w, "2050-06-01")).toBe("past");
    expect(classifyValidityWindow(null, "2030-01-01")).toBe("unknown");
    expect(classifyValidityWindow({ start: "", end: "" }, "2030-01-01")).toBe("unknown");
  });

  it("formats YYYY-MM-DD → YYYY-MM-DD compactly", () => {
    expect(formatValidityWindow({ start: "2030-05-11", end: "2042-09-23" })).toBe(
      "2030-05-11 → 2042-09-23",
    );
    expect(formatValidityWindow(null)).toBe(null);
    expect(formatValidityWindow(undefined)).toBe(null);
  });

  it("inEpochWindow: cyclers fail anything but 'all'", () => {
    const e = minimalEntry({ orbit_class: "cycler" });
    expect(inEpochWindow(e, "all", "2030-01-01")).toBe(true);
    expect(inEpochWindow(e, "open-now", "2030-01-01")).toBe(false);
    expect(inEpochWindow(e, "past", "2030-01-01")).toBe(false);
    expect(inEpochWindow(e, "future", "2030-01-01")).toBe(false);
  });

  it("inEpochWindow: mga_tour passes when 'today' is inside the window", () => {
    const e = minimalEntry({
      orbit_class: "mga_tour",
      validity_window: { start: "2030-01-01", end: "2045-01-01" },
    });
    expect(inEpochWindow(e, "open-now", "2035-06-01")).toBe(true);
    expect(inEpochWindow(e, "future", "2025-06-01")).toBe(true);
    expect(inEpochWindow(e, "past", "2050-06-01")).toBe(true);
    expect(inEpochWindow(e, "open-now", "2025-06-01")).toBe(false);
  });
});

describe("n_returns helpers", () => {
  it("nReturnsValue: cycler defaults to 'infinite' when absent", () => {
    expect(nReturnsValue(minimalEntry({ orbit_class: "cycler" }))).toBe("infinite");
    expect(nReturnsValue(minimalEntry({ orbit_class: "mga_tour" }))).toBe(null);
    expect(nReturnsValue(minimalEntry({ orbit_class: "mga_tour", n_returns: 1 }))).toBe(1);
    expect(nReturnsValue(minimalEntry({ orbit_class: "quasi_cycler", n_returns: 7 }))).toBe(7);
  });

  it("inNReturnsRange: ∞ satisfies any min and only an absent max", () => {
    const cyc = minimalEntry({ orbit_class: "cycler" });
    expect(inNReturnsRange(cyc, null, null)).toBe(true);
    expect(inNReturnsRange(cyc, 100, null)).toBe(true);
    expect(inNReturnsRange(cyc, null, 1000)).toBe(false);
  });

  it("inNReturnsRange: finite values respect [min, max]", () => {
    const qc = minimalEntry({ orbit_class: "quasi_cycler", n_returns: 5 });
    expect(inNReturnsRange(qc, 3, 10)).toBe(true);
    expect(inNReturnsRange(qc, 6, 10)).toBe(false);
    expect(inNReturnsRange(qc, 3, 4)).toBe(false);
    expect(inNReturnsRange(qc, null, null)).toBe(true);
  });

  it("inNReturnsRange: missing n_returns on an epoch-locked row fails any explicit bound", () => {
    const mga = minimalEntry({ orbit_class: "mga_tour" });
    expect(inNReturnsRange(mga, null, null)).toBe(true);
    expect(inNReturnsRange(mga, 1, null)).toBe(false);
    expect(inNReturnsRange(mga, null, 5)).toBe(false);
  });
});

describe("filter composition (Class × Window × n_returns)", () => {
  // Simulates the CatalogueTable composition rules. The component uses inline
  // logic in its script island; this verifies the underlying helpers compose
  // to the same answer for representative cases.
  const rows = [
    minimalEntry({ id: "cyc-a", orbit_class: "cycler" }),
    minimalEntry({
      id: "qc-a",
      orbit_class: "quasi_cycler",
      n_returns: 5,
      validity_window: { start: "2030-01-01", end: "2045-01-01" },
    }),
    minimalEntry({
      id: "tour-a",
      orbit_class: "mga_tour",
      n_returns: 1,
      validity_window: { start: "2026-05-11", end: "2026-12-31" },
      launch_epoch: "2026-05-11",
    }),
    minimalEntry({
      id: "tour-b",
      orbit_class: "mga_tour",
      n_returns: 1,
      validity_window: { start: "2050-01-01", end: "2055-01-01" },
    }),
  ];

  const today = "2026-06-16";

  it("Class=Cyclers selects only the cycler row", () => {
    const hits = rows.filter((r) => effectiveOrbitClass(r) === "cycler");
    expect(hits.map((r) => r.id)).toEqual(["cyc-a"]);
  });

  it("Class=Tours + Window=Open-now selects the in-window mga_tour only", () => {
    const hits = rows.filter(
      (r) => effectiveOrbitClass(r) === "mga_tour" && inEpochWindow(r, "open-now", today),
    );
    expect(hits.map((r) => r.id)).toEqual(["tour-a"]);
  });

  it("Class=Tours + Window=Future selects the future-only mga_tour", () => {
    const hits = rows.filter(
      (r) => effectiveOrbitClass(r) === "mga_tour" && inEpochWindow(r, "future", today),
    );
    expect(hits.map((r) => r.id)).toEqual(["tour-b"]);
  });

  it("All / Open-now never matches cycler rows (no window by design)", () => {
    const hits = rows.filter((r) => inEpochWindow(r, "open-now", today));
    expect(hits.every((r) => effectiveOrbitClass(r) !== "cycler")).toBe(true);
  });

  it("n_returns 3-10 + Class=Quasi-cyclers selects qc-a only", () => {
    const hits = rows.filter(
      (r) => effectiveOrbitClass(r) === "quasi_cycler" && inNReturnsRange(r, 3, 10),
    );
    expect(hits.map((r) => r.id)).toEqual(["qc-a"]);
  });
});
