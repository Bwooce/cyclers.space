import { describe, expect, it } from "vitest";
import {
  connectionsForRow,
  evidenceKind,
  isRowRefEndpoint,
  loadConnections,
} from "../connections";

describe("manifold connections registry (task #838 design / #856 upstream / #857 site)", () => {
  it("loads the committed registry and every entry parses", () => {
    const conns = loadConnections();
    expect(conns.length).toBeGreaterThan(0);
    for (const c of conns) {
      expect(c.id).toBeTruthy();
      expect(c.endpoints).toHaveLength(2);
      expect(c.evidence_class).toBeTruthy();
    }
  });

  it("every entry has at least one row_ref endpoint (the registry's admission criterion)", () => {
    for (const c of loadConnections()) {
      expect(c.endpoints.some(isRowRefEndpoint)).toBe(true);
    }
  });

  it("connectionsForRow finds the known #822 C=2.54 entries touching vaquero-31-c254", () => {
    const found = connectionsForRow("vaquero-31-c254-em-cycler-2013");
    expect(found.length).toBeGreaterThanOrEqual(2);
    const ids = found.map((c) => c.id);
    expect(ids).toContain("em-vaquero-hetero-wu21c254-ws31c254-2026");
    expect(ids).toContain("em-kumar-hetero-wu31c254-ws21c254-2026");
  });

  it("connectionsForRow returns empty for a row with no registered connection", () => {
    expect(connectionsForRow("aldrin-classic-em-k1-outbound")).toEqual([]);
  });

  it("evidenceKind classifies the two live evidence classes distinctly", () => {
    const byId = Object.fromEntries(loadConnections().map((c) => [c.id, c]));
    expect(evidenceKind(byId["em-vaquero-hetero-wu21c254-ws31c254-2026"]!)).toBe("self-consistency");
    expect(evidenceKind(byId["em-kumar-hetero-wu31c254-ws21c254-2026"]!)).toBe("digit-grade");
  });

  it("sanitizes free text: no raw #NNN task token survives in any rendered field", () => {
    // Mirrors no-task-refs.test.ts's dist-output check, but scoped to this
    // loader's own output — catches a sanitizer regression before a build is
    // even needed.
    const taskRefPattern = /#\d+\b/;
    for (const c of loadConnections()) {
      expect(c.evidence_class).not.toMatch(taskRefPattern);
      if (c.round_trip_note) expect(c.round_trip_note).not.toMatch(taskRefPattern);
      for (const ep of c.endpoints) {
        if (isRowRefEndpoint(ep)) {
          expect(ep.identity_evidence).not.toMatch(taskRefPattern);
          if (ep.model_note) expect(ep.model_note).not.toMatch(taskRefPattern);
        } else {
          expect(ep.uncatalogued.family).not.toMatch(taskRefPattern);
          expect(ep.uncatalogued.derivation).not.toMatch(taskRefPattern);
        }
      }
    }
  });

  it("sanitized free text never starts with an orphaned colon or closing punctuation", () => {
    // The specific grammar-break class caught while implementing #857: a
    // leading "#NNN" whose deletion leaves ": foo" or ") baz" with no
    // subject (NOT a general lowercase-start check — several fields
    // legitimately open with a lowercase code identifier, e.g.
    // "build_vaquero_overlap_node (...)"). Guards the upstream registry
    // text against a regression of the same break class.
    const suspectStart = /^\s*[:;,)]/;
    for (const c of loadConnections()) {
      expect(c.evidence_class).not.toMatch(suspectStart);
      if (c.round_trip_note) expect(c.round_trip_note).not.toMatch(suspectStart);
      for (const ep of c.endpoints) {
        if (isRowRefEndpoint(ep)) {
          expect(ep.identity_evidence).not.toMatch(suspectStart);
        } else {
          expect(ep.uncatalogued.derivation).not.toMatch(suspectStart);
        }
      }
    }
  });
});

describe("connection provenance is task-token free (2026-09-07 regression)", () => {
  const TASK_TOKEN = /(?<![\w-])#\d+/;
  it("provenance.data / module / notes carry no raw #NNN tracker numbers", () => {
    for (const c of loadConnections()) {
      for (const text of [c.provenance.data, c.provenance.module, ...(c.provenance.notes ?? [])]) {
        expect(TASK_TOKEN.exec(text), `${c.id}: ${text.slice(0, 100)}`).toBeNull();
      }
    }
  });
});
