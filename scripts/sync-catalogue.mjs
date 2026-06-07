// Fetch the canonical catalogue from the single source of truth (Bwooce/cyclers)
// into src/data/catalogue.yaml. Run automatically as the `prebuild` step so the
// site never carries its own committed copy of the catalogue (the file is
// gitignored). Fails loudly on a non-200 rather than building stale/missing data.
//
// Also refreshes src/data/planet-elements.json — the sourced J2000 planet
// osculating elements emitted upstream from constants.py
// (scripts/emit-planet-elements.py). Unlike the catalogue this file IS committed
// (small, like windows.json) so the build is reproducible offline; the sync
// merely keeps it current. A non-200 here is a soft warning: the committed copy
// is the floor, so the planet ellipses still trace to constants.py.
import { writeFile, mkdir, access } from "node:fs/promises";
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

// --- planet-elements.json (committed; soft-fail on a stale remote) -----------
const PE_URL =
  process.env.PLANET_ELEMENTS_URL ??
  "https://raw.githubusercontent.com/Bwooce/cyclers/main/data/planet-elements.json";
const PE_OUT = "src/data/planet-elements.json";
try {
  const peRes = await fetch(PE_URL);
  if (!peRes.ok) throw new Error(`HTTP ${peRes.status}`);
  const peBody = await peRes.text();
  const parsed = JSON.parse(peBody);
  if (!Array.isArray(parsed.bodies) || parsed.bodies.length === 0) {
    throw new Error("payload has no bodies[]");
  }
  await writeFile(PE_OUT, peBody);
  console.log(`sync-catalogue: wrote ${PE_OUT} (${peBody.length} bytes) from ${PE_URL}`);
} catch (err) {
  // Soft fail: keep the committed copy (must exist). Only hard-fail if missing.
  try {
    await access(PE_OUT);
    console.warn(`sync-catalogue: ${PE_URL} unavailable (${err.message}); keeping committed ${PE_OUT}.`);
  } catch {
    console.error(`sync-catalogue: ${PE_URL} unavailable AND ${PE_OUT} missing. Cannot build planet ellipses.`);
    process.exit(1);
  }
}
