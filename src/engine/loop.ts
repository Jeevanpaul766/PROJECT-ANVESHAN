/**
 * Adaptive research loop — High-Performance Optimized Pipeline.
 * Spec: plans/modules/M09-research-loop.md
 *
 * Implements:
 *   Phase 1: Batched claim extraction (5–8 findings per LLM request)
 *   Phase 2: Model tiering (Fast model for extraction, Smart model for critique/synthesis)
 *   Phase 3: Bounded parallel search tasks
 *   Phase 4: Concurrent contradiction detection + critique analysis
 *   Phase 5: Deduplicated search tasks
 *   Phase 6: Search cache integration
 *   Phase 7: Multi-factor round convergence (sufficient claims + zero open gaps)
 *   Phase 8: Structured boundary persistence
 *   Phase 9: High-resolution observability and performance telemetry
 */

import { intEnv, loopConfig } from "./config.js";
import { nowIso } from "./ids.js";
import {
  appendEvent,
  loadSnapshot,
  saveClaims,
  saveCritiques,
  saveFindings,
  saveMeta,
  savePlan,
  saveReport,
  setStatus,
} from "./store.js";
import { buildPlan, buildFallbackPlan } from "./agents/orchestrator.js";
import { runSearchTasks } from "./agents/search.js";
import { extractClaimsBatch } from "./agents/evidence.js";
import { critiqueFindings, detectContradictions } from "./agents/critic.js";
import { detectGaps } from "./agents/gapDetector.js";
import { writeReport } from "./agents/synthesizer.js";
import { scoreSource, applyClaims } from "./quality.js";
import { deduplicateClaims, countDuplicates } from "./dedup.js";
import { abort, deregister, register } from "./runtime.js";
import { llmCounters } from "./llm.js";
import { searchMetrics } from "./search/manager.js";
import type {
  Claim,
  Contradiction,
  Critique,
  Finding,
  ResearchGap,
  ResearchPlan,
  RunMetrics,
  SessionEvent,
  SessionMeta,
} from "./types.js";

// ---------------------------------------------------------------------------
// Event listener type
// ---------------------------------------------------------------------------

export type EventListener = (event: SessionEvent) => void;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** Override maxRounds from env. */
  maxRounds?: number;
  /** Override maxFindings from env. */
  maxFindings?: number;
  /** Called synchronously each time an event is appended. */
  onEvent?: EventListener;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function emit(
  sessionId: string,
  partial: Omit<SessionEvent, "ts">,
  onEvent?: EventListener,
): Promise<void> {
  const event = await appendEvent(sessionId, partial);
  onEvent?.(event);
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function makeMetrics(
  startTime: number,
  rounds: number,
  queries: number,
  findings: Finding[],
  claims: Claim[],
  critiques: Critique[],
  gaps: ResearchGap[],
  contradictions: Contradiction[],
  modelsUsed: Set<string>,
): RunMetrics {
  const claimsExtracted = claims.length;
  const duplicateClaims = countDuplicates(claims);
  const highConfidenceClaims = claims.filter((c) => c.confidence >= 0.7).length;
  const criticIssues = critiques.flatMap((c) => c.weaknesses).length;

  return {
    durationMs: Date.now() - startTime,
    rounds,
    queries,
    sources: findings.length,
    uniqueSources: new Set(findings.map((f) => f.source.url)).size,
    claimsExtracted,
    duplicateClaims,
    highConfidenceClaims,
    criticIssues,
    researchGaps: gaps.length,
    contradictions: contradictions.length,
    llmCalls: llmCounters.calls,
    llmFailures: llmCounters.failures,
    llmRetries: llmCounters.retries,
    modelsUsed: [...modelsUsed],
  };
}

// ---------------------------------------------------------------------------
// Convergence & Loop Decision (Phase 7)
// ---------------------------------------------------------------------------

export type LoopDecision = 
  | { action: "synthesize"; reason: string }
  | { action: "continue" };

export function evaluateLoopDecision(
  round: number,
  maxRounds: number,
  sufficient: boolean,
  planTasksLength: number,
  highConfidenceClaimCount = 0,
  minRequiredClaims = 25,
  gapCount = 0,
): LoopDecision {
  if (sufficient) {
    return { action: "synthesize", reason: `evidence sufficient after ${round} round(s)` };
  }
  if (highConfidenceClaimCount >= minRequiredClaims && gapCount === 0 && round >= 2) {
    return {
      action: "synthesize",
      reason: `comprehensive evidence target reached (${highConfidenceClaimCount} high-confidence claims, all critical gaps resolved)`,
    };
  }
  if (planTasksLength === 0) {
    return { action: "synthesize", reason: `No actionable follow-up queries generated. Proceeding to synthesis.` };
  }
  if (round >= maxRounds) {
    return { action: "synthesize", reason: `maxRounds (${maxRounds}) reached` };
  }
  return { action: "continue" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runResearch(
  sessionId: string,
  options: RunOptions = {},
): Promise<void> {
  // ── Concurrency guard ────────────────────────────────────────────────────
  const controller = register(sessionId);
  const { signal } = controller;

  // ── Load state ───────────────────────────────────────────────────────────
  const snap = await loadSnapshot(sessionId);
  const meta: SessionMeta = snap.meta;

  const cfg = loopConfig();
  const maxRounds = options.maxRounds ?? cfg.maxRounds;
  const maxFindings = options.maxFindings ?? cfg.maxFindings;
  const minRequiredClaims = intEnv("ANVESHAN_MIN_HIGH_CONFIDENCE_CLAIMS", 25);
  const { goal } = meta;

  let findings: Finding[] = snap.findings;
  let claims: Claim[] = snap.claims ?? [];
  let critiques: Critique[] = snap.critiques;
  let gaps: ResearchGap[] = [];
  let contradictions: Contradiction[] = [];
  let round = meta.roundsCompleted;
  let totalQueries = 0;
  const modelsUsed = new Set<string>([meta.model]);
  const startTime = Date.now();

  try {
    // ── Mark running ─────────────────────────────────────────────────────
    await setStatus(meta, "running");
    await emit(
      sessionId,
      {
        type: "status",
        agent: "system",
        message: `Session ${sessionId} started. Goal: ${goal}`,
        data: { round, maxRounds, maxFindings },
      },
      options.onEvent,
    );

    // ── Main adaptive loop ─────────────────────────────────────────────────
    let sufficient = false;
    let zeroDeltaStreak = 0;

    while (round < maxRounds && !signal.aborted && !sufficient) {
      const roundStartTime = Date.now();
      const initialCalls = llmCounters.calls;

      // ── 1. Plan ────────────────────────────────────────────────────────
      const extraQueries =
        critiques.length > 0
          ? critiques[critiques.length - 1].nextQueries
          : [];

      let plan: ResearchPlan;
      if (round > 0 && zeroDeltaStreak > 0) {
        // Fast-path (Phase 4): When the immediate previous round produced zero new findings,
        // construct search tasks directly from targeted critique/gap queries without
        // incurring a redundant 50s 14B planning call.
        console.log(`[loop] Round ${round + 1}: using fast-path plan from prior critique/gaps (zero-delta streak: ${zeroDeltaStreak})`);
        plan = buildFallbackPlan(goal, extraQueries, gaps);
      } else {
        plan = await buildPlan(
          goal,
          findings,
          extraQueries,
          signal,
          meta.model,
          gaps,
        );
      }
      totalQueries += plan.tasks.length;

      await emit(
        sessionId,
        {
          type: "plan",
          agent: "orchestrator",
          message: `Round ${round + 1}: plan ready — ${plan.tasks.length} task(s)`,
          data: { round: round + 1, tasks: plan.tasks.map((t) => t.query) },
        },
        options.onEvent,
      );

      if (signal.aborted) break;

      const highConfidenceCount = claims.filter((c) => c.confidence >= 0.7).length;
      const decision = evaluateLoopDecision(
        round,
        maxRounds,
        sufficient,
        plan.tasks.length,
        highConfidenceCount,
        minRequiredClaims,
        gaps.length,
      );

      if (decision.action === "synthesize") {
        await emit(
          sessionId,
          {
            type: "status",
            agent: "system",
            message: `Round ${round + 1}: ${decision.reason}`,
            data: { round: round + 1 },
          },
          options.onEvent,
        );
        break;
      }

      // ── 2. Bounded Parallel Search (Phase 3) ───────────────────────────
      const searchStartTime = Date.now();
      let { findings: delta, plan: updatedPlan } = await runSearchTasks(
        goal,
        plan,
        findings,
        signal,
      );
      const searchDurationMs = Date.now() - searchStartTime;

      // Enforce maxFindings
      const availableSpace = Math.max(0, maxFindings - findings.length);
      if (delta.length > availableSpace) {
        delta = delta.slice(0, availableSpace);
      }

      findings = [...findings, ...delta];

      for (const f of delta) {
        await emit(
          sessionId,
          {
            type: "finding",
            agent: "search",
            message: f.claim.slice(0, 120),
            data: { id: f.id, source: f.source },
          },
          options.onEvent,
        );
      }

      await emit(
        sessionId,
        {
          type: "search",
          agent: "search",
          message: `Round ${round + 1}: +${delta.length} finding(s) in ${searchDurationMs}ms (total ${findings.length})`,
          data: { delta: delta.length, total: findings.length, searchDurationMs },
        },
        options.onEvent,
      );

      if (signal.aborted) break;

      // ── Check Delta & Track Streak (Phase 2 Optimization) ───────────────
      let extractionDurationMs = 0;
      let extractionBatches = 0;
      let scoredNewClaims: Claim[] = [];
      let evalDurationMs = 0;

      if (delta.length === 0) {
        zeroDeltaStreak++;
        console.log(`[loop] Round ${round + 1}: zero meaningful delta (streak: ${zeroDeltaStreak})`);
        await emit(
          sessionId,
          {
            type: "status",
            agent: "system",
            message: `Round ${round + 1}: zero meaningful delta (streak: ${zeroDeltaStreak})`,
            data: { round: round + 1, zeroDeltaStreak },
          },
          options.onEvent,
        );

        if (zeroDeltaStreak >= 2) {
          console.log(`[loop] convergence reached — skipping remaining research rounds (${zeroDeltaStreak} zero-delta rounds)`);
          await emit(
            sessionId,
            {
              type: "status",
              agent: "system",
              message: `Early convergence reached after ${zeroDeltaStreak} consecutive zero-delta rounds — proceeding to synthesis.`,
              data: { round: round + 1, zeroDeltaStreak, findingCount: findings.length, claimCount: claims.length },
            },
            options.onEvent,
          );
          round++;
          meta.roundsCompleted = round;
          meta.findingCount = findings.length;
          meta.claimCount = claims.length;

          await Promise.all([
            saveFindings(sessionId, findings),
            savePlan(sessionId, updatedPlan),
            saveClaims(sessionId, claims),
            saveCritiques(sessionId, critiques),
            saveMeta(meta),
          ]);
          break;
        }
      } else {
        zeroDeltaStreak = 0;

        // ── 3. Batched Evidence Extraction (Phase 1 & 2) ───────────────────
        const extractionStartTime = Date.now();
        const rawNewClaims = await extractClaimsBatch(goal, delta, signal, meta.model, 8);
        extractionBatches = Math.ceil(delta.length / 8);

        for (const claim of rawNewClaims) {
          const finding = findings.find((f) => f.id === claim.sourceId);
          if (finding) {
            const score = scoreSource(finding.source, [claim]);
            scoredNewClaims.push(...applyClaims([claim], score));
          } else {
            scoredNewClaims.push(claim);
          }
        }
        extractionDurationMs = Date.now() - extractionStartTime;

        // ── 4. Deduplicate Claims ──────────────────────────────────────────
        const allClaims = await deduplicateClaims([...claims, ...scoredNewClaims]);
        claims = allClaims;

        const dupCount = countDuplicates(scoredNewClaims);
        if (scoredNewClaims.length > 0) {
          await emit(
            sessionId,
            {
              type: "status",
              agent: "system",
              message: `Round ${round + 1}: extracted ${scoredNewClaims.length} claim(s) across ${extractionBatches} batch(es) in ${extractionDurationMs}ms (${dupCount} duplicate(s))`,
              data: {
                newClaims: scoredNewClaims.length,
                duplicates: dupCount,
                totalClaims: claims.length,
                extractionDurationMs,
              },
            },
            options.onEvent,
          );
        }

        if (signal.aborted) break;

        // ── 5 & 6. Parallel Contradiction Detection & Critique (Phase 4) ───
        const evalStartTime = Date.now();
        const [roundContradictions, critique] = await Promise.all([
          detectContradictions(claims, signal, meta.model),
          critiqueFindings(goal, findings, signal, meta.model, claims),
        ]);
        evalDurationMs = Date.now() - evalStartTime;

        contradictions = [...contradictions, ...roundContradictions];
        critiques = [...critiques, critique];

        if (roundContradictions.length > 0) {
          await emit(
            sessionId,
            {
              type: "status",
              agent: "critic",
              message: `Round ${round + 1}: ${roundContradictions.length} contradiction(s) detected`,
              data: roundContradictions,
            },
            options.onEvent,
          );
        }

        await emit(
          sessionId,
          {
            type: "critic",
            agent: "critic",
            message: `Round ${round + 1}: critique complete (${critique.weaknesses.length} weaknesses, ${critique.nextQueries.length} next queries)`,
            data: critique,
          },
          options.onEvent,
        );

        if (signal.aborted) break;

        // ── 7. Gap Detection + Sufficiency Check ───────────────────────────
        const allQueries = findings
          .flatMap((f) => f.tags)
          .filter(Boolean)
          .concat(extraQueries);

        const gapResult = await detectGaps(
          goal,
          claims,
          critiques,
          allQueries,
          signal,
          meta.model,
        );
        gaps = gapResult.gaps;
        sufficient = gapResult.sufficient;

        if (gaps.length > 0) {
          await emit(
            sessionId,
            {
              type: "status",
              agent: "system",
              message: `Round ${round + 1}: ${gaps.length} gap(s) detected, sufficient=${sufficient}`,
              data: { gaps, sufficient },
            },
            options.onEvent,
          );
        }
      }

      // ── 8. Structured State Persistence (Phase 8) ──────────────────────
      round++;
      meta.roundsCompleted = round;
      meta.findingCount = findings.length;
      meta.claimCount = claims.length;

      await Promise.all([
        saveFindings(sessionId, findings),
        savePlan(sessionId, updatedPlan),
        saveClaims(sessionId, claims),
        saveCritiques(sessionId, critiques),
        saveMeta(meta),
      ]);

      const roundDurationMs = Date.now() - roundStartTime;
      const roundLlmCalls = llmCounters.calls - initialCalls;

      console.log(
        `[metrics] round=${round} searchQueries=${plan.tasks.length} findings=+${delta.length} ` +
        `claims=+${scoredNewClaims.length} batches=${extractionBatches} llmCalls=${roundLlmCalls} ` +
        `searchMs=${searchDurationMs} extractionMs=${extractionDurationMs} evalMs=${evalDurationMs} roundMs=${roundDurationMs}`,
      );

      // Early stop check
      const currentHighConf = claims.filter((c) => c.confidence >= 0.7).length;
      const endDecision = evaluateLoopDecision(
        round,
        maxRounds,
        sufficient,
        1,
        currentHighConf,
        minRequiredClaims,
        gaps.length,
      );

      if (endDecision.action === "synthesize" && (sufficient || currentHighConf >= minRequiredClaims)) {
        await emit(
          sessionId,
          {
            type: "status",
            agent: "system",
            message: `Early stop: ${endDecision.reason}`,
            data: { round, findingCount: findings.length, claimCount: claims.length },
          },
          options.onEvent,
        );
        break;
      }
    }

    if (signal.aborted) {
      await setStatus(meta, "paused");
      await emit(
        sessionId,
        {
          type: "status",
          agent: "system",
          message: `Session ${sessionId} paused after ${round} round(s).`,
          data: { round, findingCount: findings.length },
        },
        options.onEvent,
      );
      return;
    }

    // ── Synthesize ──────────────────────────────────────────────────────────
    const snap2 = await loadSnapshot(sessionId);
    const synthStartTime = Date.now();
    const report = await writeReport(
      goal,
      snap2.plan,
      findings,
      critiques,
      undefined,
      meta.model,
      claims,
      contradictions,
    );
    const synthDurationMs = Date.now() - synthStartTime;

    await saveReport(sessionId, report);
    await emit(
      sessionId,
      {
        type: "synthesize",
        agent: "synthesizer",
        message: `Report generated in ${synthDurationMs}ms — ${report.length} chars, ${findings.length} sources, ${claims.length} claims cited.`,
        data: {
          chars: report.length,
          findingCount: findings.length,
          claimCount: claims.length,
          synthDurationMs,
        },
      },
      options.onEvent,
    );

    // ── Record Metrics (Phase 9) ──────────────────────────────────────────
    const metrics = makeMetrics(
      startTime,
      round,
      totalQueries,
      findings,
      claims,
      critiques,
      gaps,
      contradictions,
      modelsUsed,
    );
    meta.metrics = metrics;

    meta.roundsCompleted = round;
    meta.findingCount = findings.length;
    meta.claimCount = claims.length;
    await setStatus(meta, "completed");
    await emit(
      sessionId,
      {
        type: "status",
        agent: "system",
        message: `Session ${sessionId} completed in ${(metrics.durationMs / 1000).toFixed(1)}s. ${round} round(s), ${findings.length} finding(s), ${claims.length} claim(s), ${metrics.llmCalls} LLM calls.`,
        data: { round, findingCount: findings.length, claimCount: claims.length, metrics },
      },
      options.onEvent,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isAbortError(error, signal)) {
      await setStatus(meta, "paused").catch(() => undefined);
    } else {
      await setStatus(meta, "failed", message).catch(() => undefined);
      await emit(
        sessionId,
        {
          type: "error",
          agent: "system",
          message: `Session ${sessionId} failed: ${message}`,
        },
        options.onEvent,
      ).catch(() => undefined);
      throw error;
    }
  } finally {
    deregister(sessionId);
  }
}

export function cancelResearch(sessionId: string): void {
  abort(sessionId);
}

export { nowIso };
