# viz-2b bundle baseline + zero-cost-when-unused proof

This is the measured record the Three.js camera (viz phase 2b) is held against:
the detail page must ship **zero WebGL bytes until the user clicks "View in 3D"**
(design §4.1, plan Task 1.1 / 1.7). Three.js is added to `dependencies` but is
imported **only** inside the button's click handler via `await import("three")`,
so Astro/Vite code-splits it into a chunk fetched on intent.

## Baseline — BEFORE any three import lands on the page

Measured after `npm run build` at the Task-1.0b commit (three installed, but no
static import anywhere; `grep -rn 'from "three"' src/` is empty).

Reference page: `dist/cycler/aldrin-classic-em-k1-outbound/` (a single-ellipse row).

| Metric | Bytes |
|---|---|
| External `_astro/*.js` files referenced by the detail page | **0** |
| Inline `<script type="module">` (the 2a kepler-time orbit island) | 3527 |
| Inline `<script type="application/json">` (clockConfig contract) | 816 |
| Total detail-page HTML | 49153 |
| Any chunk on disk containing the string `three` (`dist/_astro/*.js`) | **none** |

The site has no runtime framework: `dist/_astro/` holds **one CSS file**
(`catalogue.*.css`) and **zero JS chunks** at baseline. The 2a orbit island is
inlined into the page HTML by Astro, not split into an external chunk.

## Acceptance (the proof obligation, closed in Task 1.7)

- The detail page's **initial** JS payload (the inline module + zero external JS
  chunks) is **byte-identical** before vs after the "View in 3D" button exists —
  the button's eager init wiring is tiny and the scene code is behind the dynamic
  import.
- The `three` / `three-view` / `three-controls` chunk(s) are fetched **only
  after** the click (verified in the browser network log, Task 1.7).
- Tree-shaken core three is ~150 KB min (design §4.1). This cost is acceptable
  **only** behind the click and is documented in the button's `title` attribute.
- Other routes (home / catalogue / launch-windows / about) reference **no** three
  chunk.

## Post-button measurement

Filled in at the Task-1.7 gate after the scene + controls land.
