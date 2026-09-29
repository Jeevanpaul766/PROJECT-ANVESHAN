import { test } from "node:test";
import assert from "node:assert";
import { checkSourceRelevance } from "../engine/relevance.js";

test("checkSourceRelevance()", async (t) => {
  const goal = "What are the major challenges of solid-state battery electrolytes?";
  const taskQuery = "solid-state battery electrolyte degradation";

  await t.test("relevant battery source passes deterministically", async () => {
    const source = {
      kind: "arxiv",
      title: "Degradation Mechanisms in Solid-State Battery Electrolytes",
      url: "test",
      snippet: "We study solid-state electrolytes."
    } as any;
    
    // Contains: solid, battery, electrolytes -> overlap >= 3
    const isRelevant = await checkSourceRelevance(goal, taskQuery, source);
    assert.equal(isRelevant, true);
  });

  await t.test("unrelated superconductivity source fails deterministically", async () => {
    const source = {
      kind: "arxiv",
      title: "Introduction to High-Temperature Superconductivity for Chemists",
      url: "test",
      snippet: "Superconductivity is amazing."
    } as any;
    
    // Contains: 0 overlap
    const isRelevant = await checkSourceRelevance(goal, taskQuery, source);
    assert.equal(isRelevant, false);
  });
});
