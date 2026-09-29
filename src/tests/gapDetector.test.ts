import { test, mock, afterEach } from "node:test";
import assert from "node:assert";
import { detectGaps } from "../engine/agents/gapDetector.js";
import type { Claim, Critique } from "../engine/types.js";

function dummyClaim(): Claim {
  return {
    id: "test",
    sourceId: "src",
    statement: "Test",
    evidence: "Test",
    confidence: 0.9,
    relevance: 0.9,
    quality: 0.9,
    clusterId: null,
    createdAt: new Date().toISOString(),
  };
}

function generateClaims(count: number): Claim[] {
  return Array.from({ length: count }, dummyClaim);
}

const sampleCritique: Critique = {
  createdAt: new Date().toISOString(),
  strengths: [],
  weaknesses: [],
  missingAngles: [],
  nextQueries: ["Missing gap 1", "Missing gap 2"],
};

afterEach(() => {
  mock.restoreAll();
});

test("1. claimCount = 10 + LLM failure -> sufficient MUST NOT automatically become true", async () => {
  mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 429,
    text: async () => "Rate limit exceeded",
  }));

  const claims = generateClaims(10);
  const result = await detectGaps("Goal", claims, [sampleCritique], []);

  assert.strictEqual(result.sufficient, false);
  assert.strictEqual(result.gaps.length, 2);
  assert.strictEqual(result.gaps[0].suggestedQuery, "Missing gap 1");
});

test("2. claimCount = 20 + LLM failure -> sufficient MUST NOT automatically become true solely because of claim count", async () => {
  mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 429,
    text: async () => "Rate limit exceeded",
  }));

  const claims = generateClaims(20);
  const result = await detectGaps("Goal", claims, [sampleCritique], []);

  assert.strictEqual(result.sufficient, false);
  assert.strictEqual(result.gaps.length, 2);
});

test("3. LLM success with sufficient=true -> preserve sufficient=true", async () => {
  mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      model: "test-model",
      choices: [
        {
          message: {
            content: JSON.stringify({ gaps: [], sufficient: true }),
          },
        },
      ],
    }),
  }));

  const claims = generateClaims(5);
  const result = await detectGaps("Goal", claims, [], []);

  assert.strictEqual(result.sufficient, true);
});

test("4. LLM success with sufficient=false + actionable gaps -> preserve sufficient=false and return gaps", async () => {
  mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      model: "test-model",
      choices: [
        {
          message: {
            content: JSON.stringify({
              gaps: [
                {
                  description: "Gap",
                  importance: 0.8,
                  suggestedQuery: "Actionable gap",
                  reason: "Reason",
                },
              ],
              sufficient: false,
            }),
          },
        },
      ],
    }),
  }));

  const claims = generateClaims(5);
  const result = await detectGaps("Goal", claims, [], []);

  assert.strictEqual(result.sufficient, false);
  assert.strictEqual(result.gaps.length, 1);
  assert.strictEqual(result.gaps[0].suggestedQuery, "Actionable gap");
});

test("5. LLM failure + no deterministic actionable gap -> return sufficient=false and do not fabricate unsupported claims", async () => {
  mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 429,
    text: async () => "Rate limit exceeded",
  }));

  const claims = generateClaims(10);
  const result = await detectGaps("Goal", claims, [], []);

  assert.strictEqual(result.sufficient, false);
  assert.strictEqual(result.gaps.length, 0);
});
