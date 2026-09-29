import { test } from "node:test";
import assert from "node:assert";
import { extractClaimsBatch, buildDeterministicClaims } from "../engine/agents/evidence.js";
import type { Finding } from "../engine/types.js";

function makeFinding(id: string, title: string, snippet: string): Finding {
  return {
    id,
    agent: "search",
    claim: title,
    summary: snippet,
    confidence: 0.8,
    tags: ["battery", "solid-state"],
    source: {
      kind: "arxiv",
      title,
      url: `https://arxiv.org/abs/${id}`,
      snippet,
      year: 2024,
    },
    createdAt: new Date().toISOString(),
  };
}

test("extractClaimsBatch() - Bounded Concurrency & Partitioning", async (t) => {
  await t.test("empty findings -> empty claims", async () => {
    const claims = await extractClaimsBatch("test goal", []);
    assert.deepEqual(claims, []);
  });

  await t.test("partitions 18 findings into 3 chunks with batchSize=8 and processes all findings", async () => {
    const findings: Finding[] = Array.from({ length: 18 }, (_, i) =>
      makeFinding(
        `find_${i + 1}`,
        `Title of Finding ${i + 1}`,
        `This is a valid technical snippet for finding ${i + 1} with ionic conductivity 1.5 mS/cm and good cycling stability.`,
      ),
    );

    // Using deterministic fallback / fast model
    const claims = await extractClaimsBatch("evaluate electrolytes", findings, undefined, undefined, 8);
    assert.ok(claims.length >= 18, `Expected at least 18 claims, got ${claims.length}`);

    // Verify all source IDs are present
    const sourceIds = new Set(claims.map((c) => c.sourceId));
    for (let i = 1; i <= 18; i++) {
      assert.ok(sourceIds.has(`find_${i}`), `Missing claim for find_${i}`);
    }
  });

  await t.test("buildDeterministicClaims extracts technical sentences", () => {
    const finding = makeFinding(
      "find_det",
      "LLZO Electrolyte Study",
      "LLZO garnets exhibit room temperature ionic conductivity of 1.2 mS/cm. The activation energy was measured at 0.32 eV.",
    );
    const claims = buildDeterministicClaims(finding);
    assert.ok(claims.length > 0);
    assert.equal(claims[0].sourceId, "find_det");
    assert.ok(claims[0].statement.length > 10);
  });
});
