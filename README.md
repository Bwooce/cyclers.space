# cyclers.space

Static site for **cyclers.space** — a public, reproducible catalogue of planetary
cycler trajectories (Earth-Mars and Earth-Venus-Mars repeating orbits proposed
for interplanetary transport).

Data source: the seed catalogue at
[Bwooce/cyclers](https://github.com/Bwooce/cyclers) (file: `data/seed_cyclers.yaml`).
Currently copied into this repo at bootstrap time
(`src/data/seed_cyclers.yaml`); long-term, the build will pull from upstream
on a schedule. Sync mechanism is a follow-up.

## Tech

- [Astro](https://astro.build) 6.x with TypeScript strict
- `js-yaml` for catalogue loading
- Vanilla JS (no framework) for the planet filter and column sorting
- [GitHub Pages](https://pages.github.com/) deploy via
  `.github/workflows/deploy.yml`

## Deploy status

CI runs on every push. The workflow has two jobs:

- **`build`** — always runs. Compiles the Astro site and uploads a Pages artifact. Fails CI if the site build is broken.
- **`deploy`** — only deploys to GitHub Pages when the repo is **public** AND Pages is enabled in repo settings. Until then, `deploy` checks Pages status and logs a notice (CI stays green). To activate live deployment:
  1. Flip the repo to public (Settings → Danger Zone → Change visibility).
  2. Enable Pages: Settings → Pages → Build and deployment → Source: GitHub Actions.
  3. The next push to `main` will deploy automatically. Or trigger manually via Actions → CI → Run workflow.

## Local dev

```sh
npm install
npm run dev          # http://localhost:4321
npm run build        # static output in ./dist/
npm run preview      # preview the build locally
```

## Pages

| Path                  | Content                                                   |
| --------------------- | --------------------------------------------------------- |
| `/`                   | Index: project intro + catalogue table                    |
| `/catalogue/`         | Full catalogue, filterable by planet, sortable columns    |
| `/cycler/<id>/`       | One detail page per entry (full schema + source quotes)   |
| `/about/`             | What this is, validation level (V0-V5), how to contribute |
| `/coming-soon/`       | Placeholder for launch-window forecasts (preview banner)  |

## Custom domain

`public/CNAME` contains `cyclers.space`. This is inert until DNS is pointed at
GitHub Pages and the custom domain is enabled in repo settings.
Without DNS, the site is also reachable at
`https://bwooce.github.io/cyclers.space/` (note that internal links use the
apex-domain absolute form; the GH Pages subpath URL will 404 on navigation
until DNS is wired).

## Periodic data refresh

The site re-syncs its catalogue and recomputes encounter windows
automatically once a week (Mondays 03:17 UTC) via
`.github/workflows/refresh-windows.yml`.

What it does:

1. Pulls the latest `data/seed_cyclers.yaml` from upstream
   [Bwooce/cyclers](https://github.com/Bwooce/cyclers).
2. Runs `scripts/compute_windows.py` to generate
   `src/data/windows.json` — a synodic-cadence preview of upcoming
   encounters per cycler (N=5 by default; `REFERENCE_EPOCH` is
   currently 2026-01-01).
3. If anything changed, commits both files; the next `deploy`
   workflow ships the updated site.

### Limitations (intentional)

- **Synodic-cadence only.** This is *not* phase-matched launch-window
  computation. Real phase-matched windows require M6 work in the
  upstream cyclerfinder package; until that lands, `windows.json`
  carries cadence-only previews and the site's UI labels them as such.
  When upstream M6 lands, the compute script swaps to a real call —
  the JSON schema does not change.
- **Upstream repo must be readable.** The sync step uses
  `raw.githubusercontent.com`, which returns 404 if upstream
  `Bwooce/cyclers` is private. To unblock: either make upstream
  public, OR add a repo secret `UPSTREAM_GH_TOKEN` and switch the
  `curl` step to send it as a header.
- **Ephemerides:** astropy ships JPL DE440 ephemerides bundled with
  the package; no periodic ephemeris refresh is needed for our use.
  If the project ever adopts DE441/DE442, the corresponding astropy
  release will carry them.

Manual trigger: Actions → Refresh windows → Run workflow.

## Status

Bootstrap (v1):

- Catalogue browser
- Planet filter (V/E/M checkboxes; vanilla JS island)
- Column sorting
- Per-cycler detail pages with full source quotes
- About + validation-level table
- Launch-window forecast: placeholder until milestone M6 of the upstream
  [cyclers](https://github.com/Bwooce/cyclers) repo lands the phase-matching
  pipeline. The page exists with an explicit preview banner; no fabricated
  numbers.
