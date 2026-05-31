// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
//
// `site` is the canonical absolute URL the site will be served from. It's
// `https://cyclers.space` because that's where the apex domain points once
// DNS is wired (the CNAME file in public/ stages that). Until DNS is set,
// the site is also reachable at https://bwooce.github.io/cyclers.space/ —
// internal links use absolute paths (/catalogue/, /cycler/<id>/) which will
// resolve at the apex domain. If you want to host at the GH Pages subpath
// without the custom domain, set `base: '/cyclers.space'` here.
export default defineConfig({
  site: 'https://cyclers.space',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
