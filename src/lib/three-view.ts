// Lazy-loaded Three.js 3D camera for the per-cycler orbit view (viz phase 2b,
// design 2026-06-07-viz-phase2-timetrue-flying-camera-design.md §4). This module
// is the ONLY place that imports three, and it is itself only reached via the
// dynamic `import("../lib/three-view")` in the "View in 3D" click handler — so
// the page ships zero WebGL bytes until intent.
//
// It reads the SAME clockConfig JSON the 2a SVG island consumes (one clock, two
// renderers) and routes every position through toThree (the single ecliptic ->
// Three frame swap) so the 3D scene can never disagree with the 2D SVG.
//
// Task 1.2 stub: prove the lazy path works before the scene exists. The real
// scene (Sun, sourced planet orbit lines, inked trajectory) lands in Task 1.3.

import type { ClockConfig } from "./three-types";

export async function mountThreeView(
  host: HTMLElement,
  _cfg: ClockConfig,
  _svgId: string,
): Promise<void> {
  host.textContent = "3D loading…";
}
