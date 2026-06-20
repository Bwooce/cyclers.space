import { describe, it, expect } from "vitest";
import {
  cyclerHref,
  esc,
  legendBadgeItemHtml,
  legendCurveItemHtml,
} from "../hero-legend";

describe("hero-legend (#410)", () => {
  it("escapes HTML-significant characters", () => {
    expect(esc(`a<b>&"c`)).toBe("a&lt;b&gt;&amp;&quot;c");
  });

  it("builds a /cycler/{id} href with the id URL-encoded", () => {
    expect(cyclerHref("russell-ch4-8.049gGf2")).toBe("/cycler/russell-ch4-8.049gGf2");
    expect(cyclerHref("a b/c")).toBe("/cycler/a%20b%2Fc");
  });

  it("renders a curve row as a link to its detail page with a data-curve-id hook", () => {
    const html = legendCurveItemHtml(
      { id: "demo-1", label: "Demo (1,1)", tier: "V3", fidelity: "sourced (a,e)" },
      "#f0c060",
    );
    expect(html).toContain('href="/cycler/demo-1"');
    expect(html).toContain('data-curve-id="demo-1"');
    expect(html).toContain("hero-leg-link");
    expect(html).toContain("Demo (1,1)");
    expect(html).toContain("V3");
    expect(html).toContain("sourced (a,e)");
  });

  it("renders a badge row as a NON-link <li> (no curve, no detail page)", () => {
    const html = legendBadgeItemHtml(
      { tier: "V0", label: "Some tour", detail: "near-resonant" },
      "#888888",
    );
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).toContain("no curve drawn");
    expect(html).toContain("Some tour");
  });

  it("escapes a malicious label/id in both builders (no markup injection)", () => {
    const curve = legendCurveItemHtml(
      { id: 'x"><img>', label: "<script>", tier: "V1", fidelity: "f" },
      "#fff",
    );
    expect(curve).not.toContain("<img>");
    expect(curve).not.toContain("<script>");
    const badge = legendBadgeItemHtml(
      { tier: "V0", label: "<script>", detail: "<b>" },
      "#fff",
    );
    expect(badge).not.toContain("<script>");
    expect(badge).not.toContain("<b>");
  });
});
