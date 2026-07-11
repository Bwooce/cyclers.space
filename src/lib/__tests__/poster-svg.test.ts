import { describe, it, expect } from "vitest";
import { buildPosterSvg, POSTER_W, POSTER_H } from "../poster-svg";
import { reproducedCount } from "../hero-data";
import { heroSummary as heroSummaryForTest } from "../hero-scenes";

// Build-time poster (task #227): generated from the same scene specs as the
// gallery; the count and the honesty captions must be present, and the
// geometry must be numerically clean (no NaN leaking into path data).

describe("hero poster SVG", () => {
  const svg = buildPosterSvg();

  it("is a self-contained SVG document of the expected size", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(`width="${POSTER_W}"`);
    expect(svg).toContain(`height="${POSTER_H}"`);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("carries the LIVE count, never a hard-coded one", () => {
    expect(svg).toContain(`${reproducedCount()} independently reproduced orbits — and counting`);
  });

  it("carries the per-panel honesty captions (word-wrap-safe single tokens)", () => {
    expect(svg).toContain("max-aphelion"); // Russell rings: ring-only honesty
    expect(svg).toContain("rotating"); // Earth-Moon frame named
    expect(svg).toContain("propagated"); // CR3BP curves' provenance
    expect(svg).toContain("idealized"); // helio clock honesty
    expect(svg).toContain("drawn"); // Jovian "no curve is drawn"
    expect(svg).toContain("Uranian"); // Uranian moon-pair scene, leading panel
  });

  it("draws all six Uranian moon-pair arcs as a leading panel (never dropped by a panel-count cap)", () => {
    const { scenes } = heroSummaryForTest();
    expect(scenes[0]?.id).toBe("uranian");
    expect(svg).toContain("Uranus-centric");
    // Six distinct-hued <path> curve elements (one per moon pair) each carry a
    // <title> naming the row — asserts the panel actually drew curves, not
    // just chrome + caption text.
    const titleCount = (svg.match(/<title>/g) || []).length;
    expect(titleCount).toBeGreaterThanOrEqual(6);
  });

  it("never truncates an honesty caption (every scene fits the layout cap)", () => {
    // panelChrome caps at 14 wrapped lines as a layout guard; assert no
    // current scene comes close enough to lose a line silently.
    const wrapCount = (s: string) =>
      s.split(/\s+/).reduce(
        (acc, w) => {
          if (acc.cur && (acc.cur + " " + w).length > 70) {
            acc.n += 1;
            acc.cur = w;
          } else {
            acc.cur = acc.cur ? `${acc.cur} ${w}` : w;
          }
          return acc;
        },
        { n: 1, cur: "" },
      ).n;
    const { scenes } = heroSummaryForTest();
    for (const scene of scenes) {
      const total = scene.captionLines.reduce((n, l) => n + wrapCount(l), 0);
      expect(total, `${scene.id} caption lines`).toBeLessThanOrEqual(14);
    }
  });

  it("contains no NaN / undefined in the generated markup", () => {
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
    expect(svg).not.toContain("Infinity");
  });
});
