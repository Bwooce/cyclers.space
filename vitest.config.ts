import { defineConfig } from "vitest/config";

// Minimal vitest config for the pure-TS viz-2b camera maths (axis swap, tour
// keyframes, camera framing). The 2b maths are framework-free pure functions —
// a plain node env is sufficient (no jsdom). `astro check` stays the type/lint
// gate; this only runs the unit suite under src/lib/__tests__.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/__tests__/**/*.test.ts"],
  },
});
