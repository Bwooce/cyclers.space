// #410 hero-gallery legend item builders (pure, unit-testable).
//
// Split out of hero-gallery.ts so the legend HTML — now carrying a click-through
// link to each curve's /cycler/{id} detail page (and a data-curve-id hook for the
// 3D hover-highlight sync) — can be tested without importing three.js. The gallery
// renderer owns the colour swatches and the raycaster; this module only emits the
// honest, escaped markup: curves become links, badges stay non-link <li> (a badge
// has no drawn geometry and no detail-page curve to open).

export interface LegendCurve {
  id: string;
  label: string;
  tier: string;
  fidelity: string;
}

export interface LegendBadge {
  tier: string;
  label: string;
  detail: string;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Detail-page URL for a catalogue row id (mirrors src/pages/cycler/[id].astro). */
export function cyclerHref(id: string): string {
  return `/cycler/${encodeURIComponent(id)}`;
}

/** A curve legend row: a link to the cycler's detail page, with a data-curve-id
 *  hook so the 3D hover-highlight can sync this row. `colorHex` is the tier swatch. */
export function legendCurveItemHtml(c: LegendCurve, colorHex: string): string {
  return (
    `<li class="hero-leg-item"><a class="hero-leg-link" href="${esc(cyclerHref(c.id))}" ` +
    `data-curve-id="${esc(c.id)}">` +
    `<span class="hero-leg-swatch" style="background:${colorHex}"></span>` +
    `<span class="hero-leg-tier">${esc(c.tier)}</span> ${esc(c.label)}` +
    `<span class="hero-leg-fid">${esc(c.fidelity)}</span></a></li>`
  );
}

/** A badge legend row: NOT a link — a badge has no drawn curve and no detail-page
 *  geometry to open (the honesty rule from hero-scenes.ts). */
export function legendBadgeItemHtml(bd: LegendBadge, colorHex: string): string {
  return (
    `<li class="hero-leg-item hero-leg-badge">` +
    `<span class="hero-leg-tierbox" style="border-color:${colorHex};color:${colorHex}">${esc(bd.tier)}</span>` +
    ` ${esc(bd.label)} <span class="hero-leg-fid">${esc(bd.detail)} — no curve drawn</span></li>`
  );
}
