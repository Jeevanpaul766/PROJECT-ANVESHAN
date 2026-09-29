/**
 * Tests for quality.ts — deterministic scoring, no mocks needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreSource, applyClaims } from "../engine/quality.js";
import type { Claim, Source } from "../engine/types.js";

const makeSource = (overrides: Partial<Source> = {}): Source => ({
  kind: "arxiv",
  title: "Test Paper",
  url: "https://arxiv.org/abs/1234.5678",
  ...overrides,
});

const makeClaim = (relevance: number): Claim => ({
  id: "c1",
  sourceId: "f1",
  statement: "Test claim",
  evidence: "From the paper",
  confidence: 0.8,
  relevance,
  quality: 0,
  clusterId: null,
  createdAt: new Date().toISOString(),
});

describe("quality.ts — scoreSource()", () => {
  it("arxiv scores higher authority than brave", () => {
    const arxiv = scoreSource(makeSource({ kind: "arxiv" }));
    const brave = scoreSource(makeSource({ kind: "brave" }));
    assert.ok(arxiv.authority > brave.authority);
  });

  it("pubmed scores highest authority", () => {
    const pubmed = scoreSource(makeSource({ kind: "pubmed" }));
    assert.ok(pubmed.authority > 0.9);
  });

  it("very recent source scores near 1.0 recency", () => {
    const score = scoreSource(makeSource({ year: new Date().getFullYear() }));
    assert.ok(score.recency >= 0.95);
  });

  it("20-year-old source scores lower recency", () => {
    const score = scoreSource(makeSource({ year: new Date().getFullYear() - 20 }));
    assert.ok(score.recency <= 0.3);
  });

  it("source with long snippet scores higher evidenceQuality", () => {
    const withSnippet = scoreSource(makeSource({ snippet: "a".repeat(300) }));
    const withoutSnippet = scoreSource(makeSource({ snippet: undefined }));
    assert.ok(withSnippet.evidenceQuality > withoutSnippet.evidenceQuality);
  });

  it("claims[] with high relevance raise overall score", () => {
    const highRelevance = scoreSource(makeSource(), [makeClaim(0.9), makeClaim(0.9)]);
    const lowRelevance = scoreSource(makeSource(), [makeClaim(0.1), makeClaim(0.1)]);
    assert.ok(highRelevance.overall > lowRelevance.overall);
  });

  it("overall score is between 0 and 1", () => {
    const score = scoreSource(makeSource({ kind: "web", year: 1990 }));
    assert.ok(score.overall >= 0 && score.overall <= 1);
  });
});

describe("quality.ts — applyClaims()", () => {
  it("sets quality on all claims", () => {
    const source = makeSource({ kind: "arxiv", year: new Date().getFullYear() });
    const score = scoreSource(source, [makeClaim(0.8)]);
    const claims = [makeClaim(0.8), makeClaim(0.6)];
    const updated = applyClaims(claims, score);
    for (const c of updated) {
      assert.equal(c.quality, score.overall);
    }
  });

  it("does not mutate the original claims", () => {
    const claims = [makeClaim(0.8)];
    const score = scoreSource(makeSource());
    applyClaims(claims, score);
    assert.equal(claims[0].quality, 0); // Original untouched
  });
});
