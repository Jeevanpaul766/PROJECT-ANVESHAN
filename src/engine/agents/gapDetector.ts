/**
 * Research gap detector — Phase 2.
 *
 * Receives the current state of research (claims, critiques, past queries)
 * and identifies what is still missing: unanswered questions, weak evidence,
 * conflicting perspectives, important areas needing deeper investigation.
 *
 * Uses the SMART model (configured via ANVESHAN_SMART_MODEL).
 * Returns at most 5 gaps per invocation.
 * Falls back gracefully if the LLM is unavailable.
 *
 * The `sufficient` flag drives the adaptive loop's early-stop decision.
 */

import { chatJson } from "../llm.js";
import { resolveModel } from "../config.js";
import { id } from "../ids.js";
import type { Claim, Critique, ResearchGap } from "../types.js";

// ---------------------------------------------------------------------------
// LLM response shape
// ---------------------------------------------------------------------------

interface RawGap {
  description?: unknown;
  importance?: unknown;
  suggestedQuery?: unknown;
  reason?: unknown;
}

interface GapResponse {
  gaps?: RawGap[];
  sufficient?: unknown;
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function buildFallback(
  critiques: Critique[],
  existingQueries: string[]
): { gaps: ResearchGap[]; sufficient: boolean } {
  const allNextQueries = critiques.flatMap((c) => c.nextQueries);
  const newQueries = allNextQueries.filter((q) => !existingQueries.includes(q));
  const uniqueNewQueries = Array.from(new Set(newQueries)).slice(0, 5);
  
  const gaps: ResearchGap[] = uniqueNewQueries.map((q) => ({
    id: id("gap"),
    description: "Fallback gap based on critic suggestions",
    importance: 0.5,
    suggestedQuery: q,
    reason: "Generated via fallback because LLM was unavailable",
  }));
  
  return { gaps, sufficient: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GapDetectionResult {
  gaps: ResearchGap[];
  /** True when the model considers evidence sufficient for synthesis. */
  sufficient: boolean;
}

/**
 * Identify research gaps from the current evidence set.
 *
 * @param goal - Research goal
 * @param claims - Current extracted claims
 * @param critiques - All critiques from previous rounds
 * @param existingQueries - Queries already executed (to avoid repeats)
 * @param signal - Optional abort signal
 */
export async function detectGaps(
  goal: string,
  claims: Claim[],
  critiques: Critique[],
  existingQueries: string[],
  signal?: AbortSignal,
  model?: string,
): Promise<GapDetectionResult> {
  const fallback = buildFallback(critiques, existingQueries);
  const useModel = model ?? resolveModel("smart");

  const { value, usedModel } = await chatJson<GapResponse>(
    [
      {
        role: "system",
        content:
          "You are a research gap analyst. " +
          "Analyze the current research evidence and identify the most important missing pieces. " +
          "Return ONLY valid JSON with two keys:\n" +
          "  'gaps': array of at most 5 gap objects, each with:\n" +
          "    description (string — what is missing),\n" +
          "    importance (number 0–1),\n" +
          "    suggestedQuery (string — a short academic search query to fill this gap),\n" +
          "    reason (string — why this matters for the goal).\n" +
          "  'sufficient': boolean — true if the current evidence is comprehensive\n" +
          "    enough to write a high-quality research report.\n" +
          "Do not suggest queries that duplicate the existing searches.",
      },
      {
        role: "user",
        content: JSON.stringify({
          goal,
          claimCount: claims.length,
          sampleClaims: claims.slice(0, 10).map((c) => c.statement),
          weaknesses: critiques.flatMap((c) => c.weaknesses).slice(0, 6),
          missingAngles: critiques.flatMap((c) => c.missingAngles).slice(0, 6),
          existingQueries: existingQueries.slice(0, 15),
        }),
      },
    ],
    { gaps: [], sufficient: false },
    signal,
    useModel,
  );

  if (!usedModel) return fallback;

  const rawGaps = Array.isArray(value.gaps) ? value.gaps : [];
  const gaps: ResearchGap[] = rawGaps
    .filter(
      (g): g is RawGap =>
        typeof g.description === "string" && typeof g.suggestedQuery === "string",
    )
    .slice(0, 5)
    .map((g) => ({
      id: id("gap"),
      description: String(g.description).trim(),
      importance: clamp(Number(g.importance)),
      suggestedQuery: String(g.suggestedQuery).trim(),
      reason: typeof g.reason === "string" ? g.reason.trim() : "",
    }))
    .filter((g) => g.description && g.suggestedQuery);

  const sufficient = Boolean(value.sufficient) || gaps.length === 0;

  return { gaps, sufficient };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
