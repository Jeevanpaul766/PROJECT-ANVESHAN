/**
 * Tests for dedup.ts — lexical Jaccard deduplication, interface contract.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deduplicateClaims,
  countDuplicates,
  dedupedRoots,
  LexicalSimilarityProvider,
  DEFAULT_SIMILARITY_THRESHOLD,
} from "../engine/dedup.js";
import type { Claim } from "../engine/types.js";

let counter = 0;
const makeClaim = (statement: string): Claim => ({
  id: `c${++counter}`,
  sourceId: "f1",
  statement,
  evidence: "Evidence text",
  confidence: 0.8,
  relevance: 0.7,
  quality: 0.6,
  clusterId: null,
  createdAt: new Date().toISOString(),
});

describe("LexicalSimilarityProvider", () => {
  const provider = new LexicalSimilarityProvider();

  it("identical strings → similarity 1.0", async () => {
    const sim = await provider.similarity("machine learning neural network", "machine learning neural network");
    assert.equal(sim, 1.0);
  });

  it("completely different strings → low similarity", async () => {
    const sim = await provider.similarity("quantum physics wavelength", "basketball tournament championship");
    assert.ok(sim < 0.1, `Expected < 0.1, got ${sim}`);
  });

  it("very similar strings → similarity above threshold", async () => {
    const a = "deep learning improves performance on image classification tasks";
    const b = "deep learning significantly improves performance on image classification";
    const sim = await provider.similarity(a, b);
    assert.ok(sim >= DEFAULT_SIMILARITY_THRESHOLD, `Expected >= ${DEFAULT_SIMILARITY_THRESHOLD}, got ${sim}`);
  });

  it("empty strings → 0", async () => {
    const sim = await provider.similarity("", "hello world");
    assert.equal(sim, 0);
  });

  it("both empty → 1", async () => {
    const sim = await provider.similarity("", "");
    assert.equal(sim, 1);
  });
});

describe("deduplicateClaims()", () => {
  it("empty input → empty output", async () => {
    const result = await deduplicateClaims([]);
    assert.equal(result.length, 0);
  });

  it("single claim → clusterId set to its own id", async () => {
    const claim = makeClaim("Machine learning is powerful");
    const result = await deduplicateClaims([claim]);
    assert.equal(result[0].clusterId, result[0].id);
  });

  it("two identical statements → second is a duplicate", async () => {
    const a = makeClaim("Deep learning outperforms traditional methods on image classification");
    const b = makeClaim("Deep learning outperforms traditional methods on image classification");
    const result = await deduplicateClaims([a, b]);
    assert.equal(result[0].clusterId, result[0].id); // root
    assert.equal(result[1].clusterId, result[0].id); // duplicate
  });

  it("two different statements → each is its own cluster root", async () => {
    const a = makeClaim("Quantum computing uses superposition for parallel computation");
    const b = makeClaim("Photosynthesis converts sunlight into chemical energy in plants");
    const result = await deduplicateClaims([a, b]);
    assert.equal(result[0].clusterId, result[0].id);
    assert.equal(result[1].clusterId, result[1].id);
  });

  it("does not mutate input claims", async () => {
    const a = makeClaim("Test statement for mutation check");
    const original = { ...a };
    await deduplicateClaims([a]);
    assert.equal(a.clusterId, null); // Original unchanged
  });
});

describe("countDuplicates()", () => {
  it("returns 0 for no duplicates", () => {
    const claims: Claim[] = [
      { ...makeClaim("A"), clusterId: "c1" },
      { ...makeClaim("B"), clusterId: "c2" },
    ];
    claims[0].id = "c1";
    claims[1].id = "c2";
    assert.equal(countDuplicates(claims), 0);
  });

  it("counts claims whose clusterId differs from their id", () => {
    const claims: Claim[] = [
      { ...makeClaim("A"), id: "root", clusterId: "root" },
      { ...makeClaim("B"), id: "dup", clusterId: "root" },
    ];
    assert.equal(countDuplicates(claims), 1);
  });
});

describe("dedupedRoots()", () => {
  it("returns only root claims", () => {
    const claims: Claim[] = [
      { ...makeClaim("A"), id: "root", clusterId: "root" },
      { ...makeClaim("B"), id: "dup", clusterId: "root" },
      { ...makeClaim("C"), id: "other", clusterId: "other" },
    ];
    const roots = dedupedRoots(claims);
    assert.equal(roots.length, 2);
    assert.ok(roots.some((c: Claim) => c.id === "root"));
    assert.ok(roots.some((c: Claim) => c.id === "other"));
  });
});
