// Static endpoint: the hero poster SVG, regenerated from the live V1+ filter
// at every build (task #227, spec §3 — the chosen no-browser poster pipeline).
import type { APIRoute } from "astro";
import { buildPosterSvg } from "../lib/poster-svg";

export const GET: APIRoute = () =>
  new Response(buildPosterSvg(), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
