import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadCatalogue, sanitizeCatalogueText } from "../catalogue";
import type { Citation, CyclerEntry } from "../types";

// Regression guard (2026-07-14): the upstream data repo's prose is written
// against an internal task tracker ("task #54", "task chain #558 -> #569",
// "Per #566: ..."). Those numbers are meaningless to a site visitor and must
// never render. loadCatalogue() sanitizes every free-text field at the loader
// (sanitizeEntryText); this suite pins both the sanitizer's behaviour and the
// wiring, so a new upstream note (or a new render site) can't silently
// reintroduce raw task numbers.

// A "raw task token": # followed by digits, not embedded in an identifier
// (JPL-CL#17-3322 is a legitimate document number and must survive).
const TASK_TOKEN = /(?<![\w-])#\d+/;

describe("sanitizeCatalogueText", () => {
  it("strips task-chain venues down to the real venue", () => {
    expect(
      sanitizeCatalogueText(
        "cyclerfinder project; task chain #558 -> #561 -> #562 -> #563 -> #569",
      ),
    ).toBe("cyclerfinder project");
  });

  it("drops 'task #N' but keeps the surrounding substance", () => {
    expect(sanitizeCatalogueText("task #54 multi-rev Lambert solver")).toBe(
      "multi-rev Lambert solver",
    );
    expect(
      sanitizeCatalogueText("to be set by the multi-rev Lambert solver (task #54)."),
    ).toBe("to be set by the multi-rev Lambert solver.");
  });

  it("preserves published Russell indices, rewritten without the # sigil", () => {
    expect(sanitizeCatalogueText("Russell 2006 cycler 3.768Gh-3 (#54)")).toBe(
      "Russell 2006 cycler 3.768Gh-3 (no. 54)",
    );
    expect(sanitizeCatalogueText("parent cycler 4.991gG2(#83) is notable")).toBe(
      "parent cycler 4.991gG2 (no. 83) is notable",
    );
    expect(
      sanitizeCatalogueText("ideal-model ballistic moon cycler #131 (Table 3; 2-leg)"),
    ).toBe("ideal-model ballistic moon cycler no. 131 (Table 3; 2-leg)");
  });

  it("preserves per-flyby numbering and identifier-embedded hashes", () => {
    expect(sanitizeCatalogueText("flyby #0 at t=0")).toBe("flyby 0 at t=0");
    expect(sanitizeCatalogueText("AAS Paper 17-577 (JPL-CL#17-3322)")).toBe(
      "AAS Paper 17-577 (JPL-CL#17-3322)",
    );
  });

  it("leaves legitimate mid-sentence slashes alone", () => {
    const s = "MMR periodic orbit / halo transfer, per Table 3.4 / 4.x";
    expect(sanitizeCatalogueText(s)).toBe(s);
  });
});

/** Every catalogue-sourced free-text string a page template renders. */
function renderedTexts(e: CyclerEntry): string[] {
  const out: (string | null | undefined)[] = [e.name, e.notes, e.source_ephemeris];
  const cite = (c: Citation | undefined | null) => {
    if (c) out.push(c.title, c.venue, c.note);
  };
  cite(e.first_published);
  for (const c of e.corroborating_sources ?? []) cite(c);
  out.push(e.orbit_elements?.note, e.period?.note);
  for (const v of e.vinf_kms_at_encounters ?? []) out.push(v.note);
  for (const l of e.legs ?? []) out.push(l.note);
  for (const s of e.trajectory?.segments ?? []) out.push(s.note);
  for (const g of e.data_gaps ?? []) out.push(g.note, g.source_hint);
  out.push(e.family?.name, e.family?.nomenclature);
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(e.source_quotes);
  return out.filter((s): s is string => typeof s === "string");
}

describe("no internal task numbers reach the rendered catalogue", () => {
  const entries = loadCatalogue();

  it("covers the whole synced catalogue", () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  it("every rendered free-text field of every row is task-token free", () => {
    for (const e of entries) {
      for (const text of renderedTexts(e)) {
        const m = TASK_TOKEN.exec(text);
        expect(
          m,
          `row ${e.id} renders a raw task token ${m?.[0]} in: ${JSON.stringify(text.slice(0, 120))}`,
        ).toBeNull();
      }
    }
  });
});

// Belt-and-braces: if a built site is present (dist/ is gitignored and CI runs
// the unit suite before `astro build`, so this skips there), assert the visible
// text of every cycler detail page is free of raw task tokens. This closes the
// loop on render sites the data-level sweep can't see (template literals,
// windows.json fields, hero captions).
const DIST_CYCLER = join(process.cwd(), "dist", "cycler");

describe.skipIf(!existsSync(DIST_CYCLER))("built cycler pages (dist/)", () => {
  it("no visible #NNN task token on any cycler detail page", () => {
    const dirs = readdirSync(DIST_CYCLER, { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(dirs.length).toBeGreaterThan(50);
    for (const d of dirs) {
      const page = join(DIST_CYCLER, d.name, "index.html");
      if (!existsSync(page)) continue;
      const html = readFileSync(page, "utf8");
      const visible = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ") // tags incl. their attributes
        .replace(/&#x?[0-9a-fA-F]+;/g, " "); // numeric character references
      const m = TASK_TOKEN.exec(visible);
      expect(
        m,
        `dist/cycler/${d.name}/index.html shows raw task token ${m?.[0]}: ${JSON.stringify(
          visible.slice(Math.max(0, (m?.index ?? 0) - 60), (m?.index ?? 0) + 60),
        )}`,
      ).toBeNull();
    }
  });
});
