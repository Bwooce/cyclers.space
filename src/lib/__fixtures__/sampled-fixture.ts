// SYNTHETIC sampled-trajectory fixture for viz-2c (dev/test only — NOT real
// n-body data, NOT per-row catalogue data). It manufactures a SampledTrajectory
// by resampling the EXISTING analytic Kepler ellipse of a known craft at a fixed
// time step, via the same kepler-time stateAt the analytic renderer uses.
//
// Why this exists: the real n-body exporter (Phase C) is not built yet, but the
// sampled renderer must be provable NOW. Resampling a known ellipse gives a
// strong regression: the sampled curve and the analytic curve describe the SAME
// orbit, so the sampled renderer's output must visually COINCIDE with the
// analytic one (asserted numerically in sampled-fixture.test.ts). Any drift is a
// renderer bug, not a data difference — because the data IS the same orbit.
//
// The fixture is honest about being synthetic: its `fidelity` / `provenance`
// strings say "synthetic demo (Kepler ellipse resampled)" so the honesty
// caption never claims n-body fidelity. When the real exporter lands it emits a
// SampledTrajectory of the same shape; this file is then only a test fixture.

import type { KeplerElements } from "../kepler-time";
import { stateAt, periodDays } from "../kepler-time";
import type { SampledTrajectory } from "../three-types";

const SEC_PER_DAY = 86_400;

/** A representative Aldrin-classic-ish craft ellipse (a=2.5 AU, e=0.43, slightly
 *  inclined so all three axes carry signal). Standalone elements so the fixture
 *  does not depend on catalogue loading. */
export const FIXTURE_CRAFT: KeplerElements = {
  a: 2.5,
  e: 0.43,
  i_deg: 3.2,
  lan_deg: 25,
  argp_deg: 60,
  M0_deg: 0,
  t_epoch_day: 0,
};

/**
 * Resample FIXTURE_CRAFT (or any analytic craft) over one orbital period at a
 * fixed step (default ~5 days) into a SampledTrajectory. Times are in SECONDS
 * (the exporter's natural unit); positions are AU in the eclipJ2000 frame — the
 * SAME frame stateAt returns, so a sampled-vs-analytic comparison is apples to
 * apples. The final sample is pinned exactly to t = period so the polyline
 * closes on the analytic curve's start point.
 */
export function makeSampledFixture(
  el: KeplerElements = FIXTURE_CRAFT,
  stepDays = 5,
): SampledTrajectory {
  const P = periodDays(el);
  const t0 = el.t_epoch_day ?? 0;
  const timesSec: number[] = [];
  const positionsAU: [number, number, number][] = [];
  const nSteps = Math.max(2, Math.floor(P / stepDays));
  for (let k = 0; k <= nSteps; k++) {
    // Last step lands exactly on the period so the curve closes; interior steps
    // are the uniform ~5-day grid.
    const tDay = k === nSteps ? t0 + P : t0 + k * stepDays;
    const p = stateAt(el, tDay);
    timesSec.push(tDay * SEC_PER_DAY);
    positionsAU.push([p.x, p.y, p.z]);
  }
  return {
    kind: "sampled",
    timesSec,
    positionsAU,
    frame: "eclipJ2000",
    fidelity: "synthetic demo (Kepler ellipse resampled)",
    provenance: `dev fixture: ${stepDays}-day resample of an analytic a=${el.a} e=${el.e} ellipse (NOT n-body)`,
  };
}
