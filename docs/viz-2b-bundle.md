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

## Post-button measurement (Task-1.7 gate)

Measured after `npm run build` with the full orbit-cam scene + controls + a11y.

### Initial payload (before the click) — unchanged in kind

| Metric | Bytes |
|---|---|
| External `_astro/*.js` referenced by the detail page (initial payload) | 1 file, **6275** (the OrbitView island chunk) |
| Any `three` chunk referenced via `src=` on the detail page | **none** (0) |
| `three` chunks reachable only via dynamic `import()` (on disk) | `three.module.*.js` 704691 raw / **180161 gzip**, `three-view.*.js` 9086 (Slice 1) |

> **Slice 2 (chase-cam) update:** adding the chase-cam mode + the pure
> `three-view-chase.ts` helper grew the lazy `three-view.*.js` chunk from
> **9086 → 10133 bytes** (+1047, the mode switch + damped look-at wiring). The
> `three.module.*.js` core is byte-unchanged (704691 raw). The initial payload is
> still **zero WebGL bytes** — both three chunks remain reachable only via the
> on-click `import()` (re-verified in the Playwright network log: 0 `three`
> requests before the click, `three-view` + `three.module` fetched only after).
>
> **Slice 3 (guided tour) update:** adding the geometry-derived `three-tour.ts`
> keyframes + the `T` tour runner (continuous keyframe lerp, live-region beat
> narration with folded-in proximity, cancel-on-any-input, reduced-motion
> jump-cut stepped fallback) grew the lazy `three-view.*.js` chunk from
> **10133 → 12809 bytes** (+2676). The `three.module.*.js` core is still
> byte-unchanged (704691 raw / 180161 gzip). Re-verified in the Playwright
> network log on a fresh load: **0** `three` requests before the "View in 3D"
> click; `three-view` + `three.module` fetched only after. Other routes
> (home / launch-windows) reference no three chunk. Only the 7 single-ellipse
> rows render the button; CR3BP / multi-arc rows show the honest "3D view not
> available" note instead.

> **Deviation from the literal "byte-identical initial payload" wording:** once the
> button handler contains a dynamic `import("../lib/three-view")`, Astro/Vite
> stops inlining the OrbitView island into the page HTML and emits it as an
> external `_astro/OrbitView.*.js` chunk (~6.3 KB) referenced by `src=`. The
> chunk is the SAME 2a island code plus the tiny eager launcher wiring; **no
> three bytes are in it** (verified: the only `three` token is the dynamic-import
> string `import("./three-view.*.js")`). The invariant the proof actually
> protects — *zero WebGL bytes until intent* — holds exactly. The literal
> "byte-identical" phrasing pre-dated knowing Vite would externalise the island;
> the honest restatement is "the initial payload gains no WebGL bytes and grows
> only by the few-KB launcher wiring, which Vite chose to split into its own
> chunk."

### The click-only fetch (network-log proof, Playwright MCP)

- Before the click: **0** network requests matching `three`.
- After the click: `three-view.*.js` **and** `three.module.*.js` fetched (both
  HTTP 200) — and nothing else three-related earlier.

### Other routes — zero new bytes

Home / catalogue / launch-windows / about reference **no** three chunk. (The
string `three` appears once in home/catalogue/launch-windows HTML only inside the
prose "low-energy three-synodic ballistic" cycler description — not a script
reference.)

### Regression + a11y (browser-verified)

- 2a SVG renders; play/scrub moves the craft; tilt morph applies its matrix
  transform; both proximity sparklines + the live readout work — unchanged.
- 3D: focus moves into the canvas on open (role=application); `?` toggles the key
  help; `[`/`]` step time and the live region announces nearest-body proximity;
  `Esc` destroys the canvas and returns focus to the SVG; re-clicking re-mounts.
- Reduced-motion: no autoplay, `Space` inert (announces manual-step), `[`/`]`
  still step. Dark mode: clear color = `0x161616` (the dark material set).
- SVG <-> 3D time sync: stepping time in the 3D canvas moves the SVG craft marker
  too (one clock, two renderers).
