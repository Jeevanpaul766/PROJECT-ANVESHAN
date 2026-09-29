/**
 * Manual research-loop probe for M09 acceptance.
 * Spec: plans/modules/M09-research-loop.md
 *
 * Checks:
 *  1. maxRounds=1  →  report file written, status = completed.
 *  2. Abort mid-run  →  snapshot still loadable, status = paused.
 *  3. Resume: paused session continues from roundsCompleted, does not wipe findings.
 */

import { createSession, loadSnapshot } from "../engine/store.js";
import { runResearch, cancelResearch } from "../engine/loop.js";
import type { SessionEvent } from "../engine/types.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function label(tag: string, ok: boolean): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${tag}`);
}

const goal = "sulfide solid-state battery electrolytes 2024";

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: maxRounds=1 → completed + report
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== Test 1: maxRounds=1 full run ===");

const sess1 = await createSession(goal);
const events1: SessionEvent[] = [];

await runResearch(sess1.id, {
  maxRounds: 1,
  onEvent: (e) => events1.push(e),
});

const snap1 = await loadSnapshot(sess1.id);
label("status = completed", snap1.meta.status === "completed");
label("roundsCompleted = 1", snap1.meta.roundsCompleted === 1);
label("reportMarkdown non-null", snap1.reportMarkdown !== null && snap1.reportMarkdown!.length > 0);
label("report has ## Sources", (snap1.reportMarkdown ?? "").includes("## Sources"));
label("findings > 0", snap1.findings.length > 0);
label("critiques.length > 0", snap1.critiques.length > 0);
label("emitted synthesize event", events1.some((e) => e.type === "synthesize"));

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: abort mid-run → status = paused, snapshot readable
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== Test 2: abort → paused ===");

const sess2 = await createSession(goal);
const events2: SessionEvent[] = [];

// Fire abort right after the run starts (on the next tick)
setTimeout(() => cancelResearch(sess2.id), 50);

await runResearch(sess2.id, {
  maxRounds: 10,
  onEvent: (e) => events2.push(e),
});

const snap2 = await loadSnapshot(sess2.id);
label("status = paused", snap2.meta.status === "paused");
label("snapshot is loadable", snap2.meta.id === sess2.id);

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: resume from paused — round count grows, findings not wiped
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== Test 3: resume from paused ===");

// Use sess1 (completed) as a base: manually set it to paused to simulate resume
// Actually easier: create fresh session, run 1 round, check it picks up

const sess3 = await createSession(goal);
await runResearch(sess3.id, { maxRounds: 1 });
const snapAfterRound1 = await loadSnapshot(sess3.id);
const findingsAfterRound1 = snapAfterRound1.findings.length;
const roundsAfterRound1 = snapAfterRound1.meta.roundsCompleted;

// Simulate "paused" by patching status — then resume for 1 more round.
// We do this by mutating the snapshot's meta on disk via store.saveMeta.
import { saveMeta } from "../engine/store.js";
const patchedMeta = { ...snapAfterRound1.meta, status: "paused" as const };
await saveMeta(patchedMeta);

await runResearch(sess3.id, { maxRounds: 2 });
const snapAfterRound2 = await loadSnapshot(sess3.id);

label(
  "roundsCompleted > round1",
  snapAfterRound2.meta.roundsCompleted > roundsAfterRound1,
);
label(
  "findings not wiped (≥ round1 count)",
  snapAfterRound2.findings.length >= findingsAfterRound1,
);
label("status = completed after resume", snapAfterRound2.meta.status === "completed");

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: double-run on same session throws
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== Test 4: double-run concurrency guard ===");

const sess4 = await createSession(goal);
let threw = false;
const run1 = runResearch(sess4.id, { maxRounds: 1 });
try {
  await runResearch(sess4.id, { maxRounds: 1 });
} catch {
  threw = true;
}
await run1.catch(() => undefined); // let it finish
label("second runResearch throws", threw);

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== Summary ===");
console.log(
  JSON.stringify(
    {
      test1_completed: snap1.meta.status === "completed",
      test1_hasReport: (snap1.reportMarkdown ?? "").includes("## Sources"),
      test1_findings: snap1.findings.length,
      test2_paused: snap2.meta.status === "paused",
      test3_roundsGrew:
        snapAfterRound2.meta.roundsCompleted > roundsAfterRound1,
      test3_findingsPreserved:
        snapAfterRound2.findings.length >= findingsAfterRound1,
      test4_concurrencyGuard: threw,
    },
    null,
    2,
  ),
);

const pass =
  snap1.meta.status === "completed" &&
  (snap1.reportMarkdown ?? "").includes("## Sources") &&
  snap1.findings.length > 0 &&
  snap2.meta.status === "paused" &&
  snapAfterRound2.meta.roundsCompleted > roundsAfterRound1 &&
  snapAfterRound2.findings.length >= findingsAfterRound1 &&
  threw;

process.exit(pass ? 0 : 1);
