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
