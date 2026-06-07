// viz-2c honesty caption builder (design §5, BINDING). The 3D overlay must state
// PER CURVE which model produced it — never let the sampled craft borrow the
// planets' authority or vice versa. Pure (no three / no DOM) so the exact lines
// are unit-testable; three-view.ts joins them with "\n" into the caption div.
//
// Rules:
//  - The craft line names its own model: the analytic badge for a Kepler row, or
//    "craft: sampled (<fidelity>)" + its provenance for a sampled row. We keep
//    the analytic badge text too when sampled, so nothing the SVG showed is lost
//    — we ADD, never remove (the prompt's "never remove" rule).
//  - The planets line ALWAYS states the planets are Standish osculating ellipses
//    (the catalogue citation), so a sampled craft can never be read as implying
//    the planets are n-body too.
//  - The encounter-marker provenance is carried verbatim (it already says
//    whether markers are time-true / idealized).

import type { ClockConfig } from "./three-types";
import { PLANET_GEOMETRY_CITATION } from "./orbit";

/** The per-curve honesty caption lines for the 3D overlay, in display order.
 *  Empty/undefined entries are dropped by the caller's filter. */
export function captionLines(cfg: ClockConfig): string[] {
  const planetCitation = cfg.planetCitation ?? PLANET_GEOMETRY_CITATION;
  const lines: string[] = [];

  if (cfg.craftSampled) {
    // Sampled craft: name the sampled model + its provenance explicitly.
    lines.push(`craft: sampled — ${cfg.craftSampled.fidelity}`);
    lines.push(`craft samples: ${cfg.craftSampled.provenance}`);
    // Keep the analytic badge too (the curve the sampled data was derived from
    // / the framing fallback) so no prior provenance string is dropped.
    if (cfg.fidelityBadge) lines.push(cfg.fidelityBadge);
  } else if (cfg.fidelityBadge) {
    lines.push(cfg.fidelityBadge);
  }

  // Planets are ALWAYS Standish osculating ellipses — stated even when the craft
  // is sampled, so the two fidelities never blur together.
  lines.push(`planets: Standish osculating ellipses — ${planetCitation}`);

  if (cfg.clockLabel) lines.push(cfg.clockLabel);
  if (cfg.encProvenance) lines.push(cfg.encProvenance);

  return lines.filter(Boolean);
}
