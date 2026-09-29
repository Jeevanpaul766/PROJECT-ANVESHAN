/**
 * Tests for citations.ts — buildCitationMap, renderCitationSection, etc.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCitationMap,
  buildCitationMapFromFindings,
  renderCitationSection,
  getCitationIndex,
} from "../engine/citations.js";
import type { Claim, Finding } from "../engine/types.js";

function makeFinding(id: string, url: string, year?: number): Finding {
  return {
    id,
    createdAt: new Date().toISOString(),
    agent: "search",
    claim: "Test claim",
    summary: "Test summary",
    source: {
      kind: "arxiv",
      title: `Paper ${id}`,
      url,
      year,
    },
    confidence: 0.7,
    tags: [],
  };
}

function makeClaim(id: string, sourceId: string): Claim {
  return {
    id,
    sourceId,
    statement: "Test statement",
    evidence: "Test evidence",
    confidence: 0.8,
    relevance: 0.7,
    quality: 0.6,
    clusterId: null,
    createdAt: new Date().toISOString(),
  };
}

describe("buildCitationMap()", () => {
  it("assigns ascending citation indexes to unique URLs", () => {
    const findings = [
      makeFinding("f1", "https://arxiv.org/abs/1"),
      makeFinding("f2", "https://arxiv.org/abs/2"),
    ];
    const claims = [
      makeClaim("c1", "f1"),
      makeClaim("c2", "f2"),
    ];
    const map = buildCitationMap(claims, findings);
    assert.equal(map.citations.length, 2);
    const idx1 = map.indexByUrl.get("https://arxiv.org/abs/1");
    const idx2 = map.indexByUrl.get("https://arxiv.org/abs/2");
    assert.ok(idx1 !== undefined && idx2 !== undefined);
    assert.notEqual(idx1, idx2);
  });

  it("same URL in multiple claims → same citation index", () => {
    const findings = [makeFinding("f1", "https://arxiv.org/abs/1")];
    const claims = [makeClaim("c1", "f1"), makeClaim("c2", "f1")];
    const map = buildCitationMap(claims, findings);
    assert.equal(map.indexByUrl.size, 1);
    assert.equal(map.citations[0].citationIndex, map.citations[1].citationIndex);
  });

  it("claim with unknown sourceId is silently skipped", () => {
    const findings = [makeFinding("f1", "https://arxiv.org/abs/1")];
    const claims = [makeClaim("c1", "no-such-finding")];
    const map = buildCitationMap(claims, findings);
    assert.equal(map.citations.length, 0);
    assert.equal(map.indexByUrl.size, 0);
  });

  it("empty input → empty map", () => {
    const map = buildCitationMap([], []);
    assert.equal(map.citations.length, 0);
    assert.equal(map.indexByUrl.size, 0);
  });
});

describe("buildCitationMapFromFindings()", () => {
  it("assigns indexes to all unique URLs", () => {
    const findings = [
      makeFinding("f1", "https://arxiv.org/abs/1"),
      makeFinding("f2", "https://arxiv.org/abs/2"),
    ];
    const map = buildCitationMapFromFindings(findings);
    assert.equal(map.indexByUrl.size, 2);
  });

  it("deduplicate duplicate URLs", () => {
    const findings = [
      makeFinding("f1", "https://arxiv.org/abs/1"),
      makeFinding("f2", "https://arxiv.org/abs/1"), // same URL
    ];
    const map = buildCitationMapFromFindings(findings);
    assert.equal(map.indexByUrl.size, 1);
  });
});

describe("renderCitationSection()", () => {
  it("renders numbered source list", () => {
    const findings = [makeFinding("f1", "https://arxiv.org/abs/1", 2024)];
    const claims = [makeClaim("c1", "f1")];
    const map = buildCitationMap(claims, findings);
    const section = renderCitationSection(map, findings);
    assert.ok(section.includes("## Sources"));
    assert.ok(section.includes("[1]"));
    assert.ok(section.includes("https://arxiv.org/abs/1"));
    assert.ok(section.includes("2024"));
  });

  it("returns empty message when no sources", () => {
    const map = buildCitationMapFromFindings([]);
    const section = renderCitationSection(map, []);
    assert.ok(section.includes("No sources collected"));
  });
});

describe("getCitationIndex()", () => {
  it("returns correct index", () => {
    const findings = [makeFinding("f1", "https://arxiv.org/abs/1")];
    const claims = [makeClaim("c1", "f1")];
    const map = buildCitationMap(claims, findings);
    const idx = getCitationIndex(findings[0], map);
    assert.equal(idx, 1);
  });

  it("returns undefined for unknown finding", () => {
    const map = buildCitationMapFromFindings([]);
    const finding = makeFinding("fx", "https://unknown.example.com/");
    assert.equal(getCitationIndex(finding, map), undefined);
  });
});
