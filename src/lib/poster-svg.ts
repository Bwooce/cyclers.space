// Build-time SVG poster for the front-page hero (task #227, spec §3).
//
// CHOSEN poster mechanism (over a Playwright-CI screenshot): a deterministic
// SVG montage generated at build from the SAME scene specs the live gallery
// uses (hero-scenes.ts). No browser in CI, nothing to rot separately from
// the data — every deploy regenerates it because it IS part of the build
// (served by the /poster.svg static endpoint).
//
// Three panels — heliocentric / Earth-Moon rotating frame / Jovian badge
// card — each with its own honesty caption. Geometry comes only from the
// shared pure modules (kepler-time samplePath, cr3bp-propagate): the poster
// can never draw something the gallery (and the data) wouldn't.
//
// Self-contained styling (the poster is consumed as an <img>, where page CSS
// cannot reach), dark cosmic palette, 1200x630 (the standard social-card
// aspect, should an og-image rasterizer be added later).

import { samplePath, stateAt, type KeplerElements } from "./kepler-time";
import { propagateCr3bp } from "./cr3bp-propagate";
import { heroSummary, type HeroSceneSpec, type SceneCurveSpec } from "./hero-scenes";
import { reproducedEntries } from "./hero-data";

export const POSTER_W = 1200;
export const POSTER_H = 630;

const C = {
  bg: "#0b0e14",
  panel: "#11151f",
  border: "#2a3142",
  text: "#e6e9f0",
  muted: "#8b93a7",
  faint: "#525b70",
  sun: "#ffcc66",
  planetLine: "#5a6478",
  earth: "#7fb2e0",
  moon: "#c9ced9",
  tier: { V5: "#e08fe0", V4: "#e0907f", V3: "#f0c060", V2: "#6fd08c", V1: "#7fa8e0" } as Record<string, string>,
  // Distinct hues for the five Earth-Moon curves (colour + legend, never
  // colour alone — the legend names each curve).
  emCurves: ["#6fd08c", "#7fa8e0", "#f0c060", "#e0907f", "#c89fe8"],
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word-wrap for SVG <text> lines. */
function wrap(s: string, maxChars: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function polyline(points: { x: number; y: number }[], toPx: (p: { x: number; y: number }) => [number, number]): string {
  return points
    .map((p, i) => {
      const [x, y] = toPx(p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

interface Panel {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Heliocentric panel: planet ellipses + Kepler curves + honest aphelion rings. */
function helioPanel(scene: HeroSceneSpec, p: Panel): string {
  const draw = { x: p.x + 10, y: p.y + 34, w: p.w - 20, h: p.h - 200 };
  const cx = draw.x + draw.w / 2;
  const cy = draw.y + draw.h / 2;
  let maxR = 1.6;
  for (const c of scene.curves) {
    if (c.geom.kind === "ring") maxR = Math.max(maxR, c.geom.radiusAu);
    if (c.geom.kind === "kepler-ellipse") maxR = Math.max(maxR, c.geom.el.a * (1 + c.geom.el.e));
  }
  for (const b of scene.bodies) {
    if (b.el) maxR = Math.max(maxR, b.el.a * (1 + b.el.e));
  }
  const scale = Math.min(draw.w, draw.h) / 2 / (maxR * 1.06);
  const toPx = (q: { x: number; y: number }): [number, number] => [cx + q.x * scale, cy - q.y * scale];

  const parts: string[] = [];
  // Sourced planet ellipses (dashed) + markers at t=0 on the idealized clock.
  for (const b of scene.bodies) {
    if (!b.el) continue;
    parts.push(
      `<path d="${polyline(samplePath(b.el, 180), toPx)}" fill="none" stroke="${C.planetLine}" stroke-width="1" stroke-dasharray="4 4"/>`,
    );
    const s0 = stateAt(b.el, 0);
    const [bx, by] = toPx(s0);
    parts.push(`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="3" fill="${C.earth}"/>`);
    parts.push(
      `<text x="${(bx + 6).toFixed(1)}" y="${(by + 4).toFixed(1)}" fill="${C.muted}" font-size="11">${esc(b.name)}</text>`,
    );
  }
  // Honest max-aphelion rings, tier-coloured, faint.
  for (const c of scene.curves) {
    if (c.geom.kind !== "ring") continue;
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${(c.geom.radiusAu * scale).toFixed(1)}" fill="none" stroke="${C.tier[c.tier] ?? C.faint}" stroke-width="0.8" opacity="0.35"/>`,
    );
  }
  // True Kepler curves on top.
  for (const c of scene.curves) {
    if (c.geom.kind !== "kepler-ellipse") continue;
    parts.push(
      `<path d="${polyline(samplePath(c.geom.el, 240), toPx)}" fill="none" stroke="${C.tier[c.tier] ?? C.text}" stroke-width="1.8"/>`,
    );
  }
  // Sun.
  parts.push(`<circle cx="${cx}" cy="${cy}" r="4.5" fill="${C.sun}"/>`);
  return parts.join("\n");
}

/** Earth-Moon panel: rotating-frame PCR3BP propagations. */
function earthMoonPanel(scene: HeroSceneSpec, p: Panel): string {
  const draw = { x: p.x + 10, y: p.y + 34, w: p.w - 20, h: p.h - 200 };
  const curves = scene.curves
    .filter((c): c is SceneCurveSpec & { geom: { kind: "cr3bp"; mu: number; stateNd: number[]; periodNd: number; periodDays: number | null } } => c.geom.kind === "cr3bp")
    .map((c) => ({ spec: c, orbit: propagateCr3bp(c.geom.mu, c.geom.stateNd, c.geom.periodNd) }));

  // Frame on the union extent of curves + the two primaries.
  let minX = -0.2, maxX = 1.1, minY = -0.5, maxY = 0.5;
  for (const { orbit } of curves) {
    for (const q of orbit.points) {
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min(draw.w / spanX, draw.h / spanY) / 1.08;
  const cx = draw.x + draw.w / 2 - ((minX + maxX) / 2) * scale;
  const cy = draw.y + draw.h / 2 + ((minY + maxY) / 2) * scale;
  const toPx = (q: { x: number; y: number }): [number, number] => [cx + q.x * scale, cy - q.y * scale];

  const parts: string[] = [];
  curves.forEach(({ spec, orbit }, i) => {
    parts.push(
      `<path d="${polyline(orbit.points, toPx)}" fill="none" stroke="${C.emCurves[i % C.emCurves.length]}" stroke-width="1.4" opacity="0.9"><title>${esc(spec.label)} (${spec.tier})</title></path>`,
    );
  });
  for (const b of scene.bodies) {
    if (!b.fixed) continue;
    const [bx, by] = toPx(b.fixed);
    const r = b.name === "Earth" ? 5 : 3;
    const col = b.name === "Earth" ? C.earth : C.moon;
    parts.push(`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${r}" fill="${col}"/>`);
    parts.push(
      `<text x="${(bx + 7).toFixed(1)}" y="${(by + 4).toFixed(1)}" fill="${C.muted}" font-size="11">${esc(b.name)}</text>`,
    );
  }
  return parts.join("\n");
}

/** Jovian panel: badge card — rows named + counted, NO curve drawn. */
function badgePanel(scene: HeroSceneSpec, p: Panel): string {
  const parts: string[] = [];
  let y = p.y + 64;
  for (const b of scene.badges) {
    const tierCol = C.tier[b.tier] ?? C.muted;
    parts.push(
      `<rect x="${p.x + 16}" y="${y - 11}" rx="3" width="26" height="16" fill="none" stroke="${tierCol}"/>`,
    );
    parts.push(
      `<text x="${p.x + 29}" y="${y + 1}" fill="${tierCol}" font-size="10" text-anchor="middle">${esc(b.tier)}</text>`,
    );
    for (const [i, line] of wrap(b.label, 44).entries()) {
      parts.push(`<text x="${p.x + 50}" y="${y + 2 + i * 14}" fill="${C.text}" font-size="12">${esc(line)}</text>`);
      if (i > 0) y += 14;
    }
    y += 16;
    for (const line of wrap(b.detail, 56)) {
      parts.push(`<text x="${p.x + 50}" y="${y}" fill="${C.muted}" font-size="10.5">${esc(line)}</text>`);
      y += 13;
    }
    y += 14;
  }
  parts.push(
    `<text x="${p.x + 16}" y="${y + 6}" fill="${C.faint}" font-size="11" font-style="italic">No curve drawn — see caption.</text>`,
  );
  return parts.join("\n");
}

function panelChrome(scene: HeroSceneSpec, p: Panel): string {
  const parts: string[] = [
    `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="${C.panel}" stroke="${C.border}"/>`,
    `<text x="${p.x + 16}" y="${p.y + 24}" fill="${C.text}" font-size="15" font-weight="600">${esc(scene.title)}</text>`,
  ];
  // Honesty caption: the scene's computed caption lines (each scene's first
  // line already names the frame + units), wrapped, bottom-anchored. EVERY
  // honesty line must survive — the cap exists only as a layout guard and is
  // sized above what any current scene produces (asserted by the unit test).
  const lines = scene.captionLines.flatMap((l) => wrap(l, 70));
  const maxLines = 14;
  const shown = lines.slice(0, maxLines);
  let ty = p.y + p.h - 12 - (shown.length - 1) * 11.5;
  for (const line of shown) {
    parts.push(`<text x="${p.x + 16}" y="${ty.toFixed(1)}" fill="${C.muted}" font-size="9">${esc(line)}</text>`);
    ty += 11.5;
  }
  return parts.join("\n");
}

/** The full hero poster SVG (also the /poster.svg endpoint body). */
export function buildPosterSvg(): string {
  const { count, scenes } = heroSummary();

  // Header tier tally from the live filter (never hard-coded).
  const tierCounts = new Map<string, number>();
  for (const e of reproducedEntries()) {
    const t = e.validation_level ?? "V0";
    tierCounts.set(t, (tierCounts.get(t) ?? 0) + 1);
  }
  const tally = ["V5", "V4", "V3", "V2", "V1"]
    .filter((t) => tierCounts.has(t))
    .map(
      (t, i) =>
        `<tspan fill="${C.tier[t]}" dx="${i === 0 ? 0 : 14}">●</tspan><tspan fill="${C.muted}" dx="4">${t} ×${tierCounts.get(t)}</tspan>`,
    )
    .join("");

  const headerH = 86;
  const margin = 16;
  const panelW = (POSTER_W - margin * 4) / 3;
  const panelH = POSTER_H - headerH - margin;
  const panels: Panel[] = scenes.slice(0, 3).map((_, i) => ({
    x: margin + i * (panelW + margin),
    y: headerH,
    w: panelW,
    h: panelH,
  }));

  const body = scenes
    .slice(0, 3)
    .map((scene, i) => {
      const p = panels[i]!;
      const content =
        scene.id === "heliocentric"
          ? helioPanel(scene, p)
          : scene.id === "earth-moon"
            ? earthMoonPanel(scene, p)
            : badgePanel(scene, p);
      return `${panelChrome(scene, p)}\n${content}`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_W}" height="${POSTER_H}" viewBox="0 0 ${POSTER_W} ${POSTER_H}" role="img" aria-label="Poster: every independently reproduced cycler orbit in the catalogue, drawn per-system with honest fidelity captions.">
<rect width="${POSTER_W}" height="${POSTER_H}" fill="${C.bg}"/>
<g font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">
<text x="${margin + 2}" y="36" fill="${C.text}" font-size="26" font-weight="700">cyclers.space</text>
<text x="${margin + 2}" y="62" fill="${C.text}" font-size="17">${count} independently reproduced orbits — and counting</text>
<text x="${POSTER_W - margin}" y="36" text-anchor="end" font-size="12">${tally}</text>
<text x="${POSTER_W - margin}" y="58" text-anchor="end" fill="${C.faint}" font-size="11">validation V1+ of the open cycler catalogue — regenerated at every build</text>
${body}
</g>
</svg>
`;
}
