import { describe, it, expect } from "vitest";
import { jacobiConstant, propagateCr3bp } from "../cr3bp-propagate";
import { loadCatalogue } from "../catalogue";

// Honesty gate for the hero's Earth-Moon scene (task #227): the propagation
// is only allowed on screen because it is checkable against SOURCED
// invariants (golden-tests-sourced-only rule). The expected side here is the
// row's own catalogue data: jacobi_constant and period_nd trace to Ross &
// Roberts-Tsoukkas 2025 Table 3; mass_ratio to the paper's mu. state_nd is
// the in-catalogue derived state (provenance recorded in the row's
// data_gaps) — consistency of C(state_nd) with the SOURCED C is exactly the
// check that makes drawing the curve honest.

const rossRows = () =>
  loadCatalogue().filter(
    (e) => (e.cycler_class ?? "") === "non-keplerian" && e.orbit_elements.cr3bp?.state_nd != null,
  );

describe("CR3BP propagation of the Ross Earth-Moon cycler rows", () => {
  it("finds the five Ross rows with a complete CR3BP tuple", () => {
    expect(rossRows().length).toBeGreaterThanOrEqual(5);
  });

  it("Jacobi constant of each row's state_nd matches the SOURCED jacobi_constant", () => {
    for (const row of rossRows()) {
      const cr = row.orbit_elements.cr3bp!;
      const c = jacobiConstant(cr.mass_ratio!, {
        x: cr.state_nd![0]!,
        y: cr.state_nd![1]!,
        vx: cr.state_nd![3]!,
        vy: cr.state_nd![4]!,
      });
      // state_nd is printed to ~10 significant digits in the catalogue, so
      // agreement with the 15-digit sourced C is bounded by that printing.
      expect(Math.abs(c - cr.jacobi_constant!), row.id).toBeLessThan(1e-7);
    }
  });

  it("each orbit closes at its SOURCED period and conserves C through the integration", () => {
    for (const row of rossRows()) {
      const cr = row.orbit_elements.cr3bp!;
      const orbit = propagateCr3bp(cr.mass_ratio!, cr.state_nd!, cr.period_nd!);
      // Closure at the sourced T. With the adaptive DP45 integrator the residual
      // floor is the catalogue's 10-decimal state_nd printing, not the integrator
      // — every row (including the demanding (1,1)b/braik-ross-c11b 6-lobe rosette)
      // closes well under 1e-3 nd (~380 km).
      expect(orbit.closureNd, `${row.id} closure`).toBeLessThan(1e-3);
      // Integrator honesty: the adaptive Dormand-Prince RK45 holds the Jacobi
      // constant tightly for ALL rows, including the long-period multi-lobe ones
      // that fixed-step RK4 could not (braik-ross-c11b drifted ~7e-5 under RK4 at
      // 160k steps; DP45 holds it < 1e-8). One uniform bound, no per-row exception.
      expect(orbit.jacobiDrift, `${row.id} drift`).toBeLessThan(1e-8);
      // Sanity: a real polyline came back.
      expect(orbit.points.length).toBeGreaterThan(500);
      expect(orbit.timesNd[orbit.timesNd.length - 1]).toBeCloseTo(cr.period_nd!, 9);
    }
  });
});
