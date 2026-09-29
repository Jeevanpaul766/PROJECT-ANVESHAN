import { runResearch } from "../src/engine/loop.js";
import { createSession, loadSnapshot } from "../src/engine/store.js";
import { searchMetrics } from "../src/engine/search/manager.js";

async function executeBenchmark() {
  const goal = "What are the most promising solid-state battery electrolytes for commercial EVs, comparing ionic conductivity, cycling performance, manufacturing scalability, cost, and commercialization challenges?";
  
  console.log("=== STARTING OFFICIAL ANVESHAN BENCHMARK ===");
  console.log("Goal:", goal);
  console.log("Model requested: ollama:qwen2.5:14b (with tiered qwen2.5:7b for extraction)");
  
  // Reset initial search metrics
  searchMetrics.totalSearches = 0;
  searchMetrics.cacheHits = 0;
  searchMetrics.cacheMisses = 0;
  searchMetrics.httpRequests = 0;

  const session = await createSession(goal, "ollama:qwen2.5:14b");
  console.log("Session created ID:", session.id);

  const startWallClock = Date.now();
  let round1Metrics: any = null;
  let round2Metrics: any = null;
  let synthDuration = 0;
  const loggedEvents: any[] = [];

  await runResearch(session.id, {
    onEvent: (ev) => {
      loggedEvents.push({ ts: Date.now(), ...ev });
      if (ev.type === "plan" || ev.type === "search" || ev.type === "status" || ev.type === "critic" || ev.type === "synthesize") {
        console.log(`[${new Date().toISOString()}] [${ev.agent}] ${ev.message}`);
      }
      if (ev.type === "synthesize" && ev.data?.synthDurationMs) {
        synthDuration = ev.data.synthDurationMs;
      }
    }
  });

  const totalWallClock = Date.now() - startWallClock;
  const snap = await loadSnapshot(session.id);

  console.log("\n=== OFFICIAL BENCHMARK REPORT COMPLETED ===");
  console.log(JSON.stringify({
    totalWallClockMs: totalWallClock,
    roundsCompleted: snap.meta.roundsCompleted,
    findingCount: snap.findings.length,
    claimCount: snap.claims?.length ?? 0,
    highConfidenceClaims: (snap.claims ?? []).filter((c: any) => c.confidence >= 0.7).length,
    critiqueCount: snap.critiques.length,
    contradictionsCount: (snap.meta.metrics?.contradictions) ?? 0,
    gapsCount: (snap.meta.metrics?.researchGaps) ?? 0,
    searchMetrics: { ...searchMetrics },
    synthDurationMs: synthDuration,
    reportLength: snap.reportMarkdown?.length ?? 0,
    reportWords: (snap.reportMarkdown?.split(/\s+/) ?? []).length,
    sourcesList: snap.findings.map((f: any) => ({
      kind: f.source.kind,
      title: f.source.title,
      url: f.source.url,
      venue: f.source.venue,
    }))
  }, null, 2));
}

executeBenchmark().catch(err => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});
