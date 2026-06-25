import { describe, expect, it } from "vitest";
import {
  effectiveOrbitClass,
  fmtIdentity,
  isFullyDefined,
  legsOf,
  loadCatalogue,
  nReturnsValue,
  shortSourceLabel,
} from "../catalogue";

// Drift guard (2026-06-22). The site's catalogue.yaml is SYNCED from the upstream
// `cyclers` repo at build time (scripts/sync-catalogue.mjs, predev/prebuild). When
// upstream adds a row whose shape the site's parsing/render code doesn't handle,
// `astro build` crashes opaquely deep in prerender (this is exactly what happened:
// mga_tour/precursor rows made `vinf_kms_at_encounters` optional, and
// isFullyDefined() did `vinfs.length` on undefined). Schema-validating the YAML
// would NOT catch that — the row is schema-valid; it's the site code that assumed
// a field's presence.
//
// So: exercise the real synced catalogue through every page-level accessor and
// assert nothing throws. This turns a future opaque build crash into a precise,
// early test failure naming the offending row. Run in CI before `npm run build`.

describe("real synced catalogue renders without drift", () => {
  const entries = loadCatalogue();

  it("loads a non-trivial number of rows", () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  it("every row survives every page-level accessor without throwing", () => {
    for (const e of entries) {
      expect(() => {
        // The exact call paths the index/catalogue/cycler pages use to render a row.
        isFullyDefined(e);
        nReturnsValue(e);
        effectiveOrbitClass(e);
        legsOf(e);
        fmtIdentity(e);
        shortSourceLabel(e);
      }, `row ${e.id} threw during render-path accessors`).not.toThrow();
    }
  });

  it("every row has a non-empty source label (citation or provenance fallback)", () => {
    // Four-class / census rows carry provenance (orbit_source) instead of a
    // first_published Citation; shortSourceLabel must still yield a real label,
    // never "?". Pins the four-class Source-column migration.
    for (const e of entries) {
      const label = shortSourceLabel(e);
      expect(label, `row ${e.id} has empty source label`).toBeTruthy();
      expect(label, `row ${e.id} source label is a bare '?'`).not.toBe("?");
    }
  });

  it("loader normalises optional array fields so render code can't hit undefined", () => {
    // Boundary invariant: loadCatalogue() coerces optional array fields to []. This
    // is what keeps the table/detail templates (which do `.map`/`.length` directly)
    // safe on mga_tour / precursor rows that omit the field.
    for (const e of entries) {
      expect(Array.isArray(e.vinf_kms_at_encounters), `row ${e.id} vinf not an array`).toBe(true);
      // Schema v4.9 (#427): flyby_altitudes_km is optional (present only for rows with
      // a reproduced M7 trajectory); the loader coerces it to [] so the detail page's
      // `.length`/`.map` is always safe.
      expect(
        Array.isArray(e.flyby_altitudes_km),
        `row ${e.id} flyby_altitudes_km not an array`,
      ).toBe(true);
      // first_published is typed required but some four-class rows omit it upstream;
      // the loader backfills an empty Citation so the Source column never crashes.
      expect(e.first_published, `row ${e.id} first_published not normalised`).toBeTruthy();
      expect(Array.isArray(e.first_published.authors), `row ${e.id} authors not an array`).toBe(
        true,
      );
    }
  });

  it("#427: S1L1 (mcconaghy-2006-em-k2) carries computed-m7 per-node flyby altitudes", () => {
    const s1l1 = entries.find((e) => e.id === "mcconaghy-2006-em-k2");
    expect(s1l1, "mcconaghy-2006-em-k2 present").toBeTruthy();
    const fa = s1l1!.flyby_altitudes_km ?? [];
    expect(fa.length, "S1L1 has per-node flyby altitudes").toBeGreaterThan(0);
    expect(s1l1!.flyby_altitudes_source).toBe("computed-m7");
    // Every altitude is at or above the 200 km Earth/Mars floor (the bend-binding node
    // sits at the floor; gentler flybys fly higher).
    for (const f of fa) {
      expect(f.altitude_km, `node ${f.node_index} below floor`).toBeGreaterThanOrEqual(199.9);
    }
  });

  it("every row resolves to one of the known orbit classes", () => {
    const known = new Set(["cycler", "quasi_cycler", "precursor_mga", "mga_tour", "resonant_po"]);
    for (const e of entries) {
      expect(known.has(effectiveOrbitClass(e)), `row ${e.id} has unknown orbit_class`).toBe(true);
    }
  });
});
