import { test } from "node:test";
import assert from "node:assert";
import { evaluateLoopDecision } from "../engine/loop.js";

test("evaluateLoopDecision() - Loop logic", async (t) => {
  await t.test("Round 1, maxRounds 3, sufficient=false, has queries -> continue", () => {
    const decision = evaluateLoopDecision(1, 3, false, 2);
    assert.equal(decision.action, "continue");
  });

  await t.test("Round 2, maxRounds 3, sufficient=false, has queries -> continue", () => {
    const decision = evaluateLoopDecision(2, 3, false, 2);
    assert.equal(decision.action, "continue");
  });

  await t.test("Round 3, maxRounds 3, sufficient=false, has queries -> synthesize (maxRounds)", () => {
    const decision = evaluateLoopDecision(3, 3, false, 2);
    assert.equal(decision.action, "synthesize");
    assert.match((decision as any).reason, /maxRounds/);
  });

  await t.test("sufficient=true -> early synthesize", () => {
    const decision = evaluateLoopDecision(1, 3, true, 2);
    assert.equal(decision.action, "synthesize");
    assert.match((decision as any).reason, /sufficient/);
  });

  await t.test("no actionable queries -> synthesize", () => {
    const decision = evaluateLoopDecision(1, 3, false, 0);
    assert.equal(decision.action, "synthesize");
    assert.match((decision as any).reason, /No actionable follow-up queries/);
  });
});
