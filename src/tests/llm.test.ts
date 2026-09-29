import { test } from "node:test";
import assert from "node:assert";
import { extractJson } from "../engine/llm.js";

test("extractJson() robustness", async (t) => {
  await t.test("pure JSON object", () => {
    const raw = `{"claims": [{"statement": "X"}]}`;
    const result = extractJson(raw) as any;
    assert.deepEqual(result.claims, [{ statement: "X" }]);
  });

  await t.test("pure JSON array", () => {
    const raw = `[{"statement": "X"}]`;
    const result = extractJson(raw) as any;
    assert.deepEqual(result, [{ statement: "X" }]);
  });

  await t.test("JSON inside ```json fences", () => {
    const raw = "Here are the claims:\n```json\n{\"claims\": [1,2,3]}\n```\nHope it helps!";
    const result = extractJson(raw) as any;
    assert.deepEqual(result.claims, [1,2,3]);
  });

  await t.test("JSON surrounded by prose (no fences)", () => {
    const raw = "Sure! Here is the JSON:\n{\"claims\": [1,2,3]}\nLet me know if you need more.";
    const result = extractJson(raw) as any;
    assert.deepEqual(result.claims, [1,2,3]);
  });

  await t.test("array surrounded by prose (no fences)", () => {
    const raw = "Here is the array:\n[1, 2, 3]\nDone.";
    const result = extractJson(raw) as any;
    assert.deepEqual(result, [1, 2, 3]);
  });

  await t.test("malformed JSON throws", () => {
    const raw = "Here is bad json: {\"claims\": [1,2,3}"; // missing ]
    assert.throws(() => extractJson(raw), /Expected|Unexpected/);
  });

  await t.test("empty response throws", () => {
    assert.throws(() => extractJson(""), /No JSON object/);
    assert.throws(() => extractJson("I have no claims."), /No JSON object/);
  });
});
