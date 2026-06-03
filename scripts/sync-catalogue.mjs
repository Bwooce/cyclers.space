// Fetch the canonical catalogue from the single source of truth (Bwooce/cyclers)
// into src/data/catalogue.yaml. Run automatically as the `prebuild` step so the
// site never carries its own committed copy of the catalogue (the file is
// gitignored). Fails loudly on a non-200 rather than building stale/missing data.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const URL =
  process.env.CATALOGUE_URL ??
  "https://raw.githubusercontent.com/Bwooce/cyclers/main/data/catalogue.yaml";
const OUT = "src/data/catalogue.yaml";

const res = await fetch(URL);
if (!res.ok) {
  console.error(`sync-catalogue: ${URL} -> HTTP ${res.status}. Refusing to build with stale/missing catalogue.`);
  process.exit(1);
}
const body = await res.text();
if (!body.includes("- id:")) {
  console.error("sync-catalogue: fetched content does not look like the catalogue (no '- id:').");
  process.exit(1);
}
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, body);
console.log(`sync-catalogue: wrote ${OUT} (${body.length} bytes) from ${URL}`);
