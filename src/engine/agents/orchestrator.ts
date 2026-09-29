/**
 * Orchestrator agent: goal → research plan with search tasks.
 * Spec: plans/modules/M05-orchestrator.md
 * Phase 5: Query normalization & semantic deduplication to avoid redundant search operations.
 */

import { chatJson } from "../llm.js";
import { loopConfig, resolveModel } from "../config.js";
import { id, nowIso } from "../ids.js";
import type { Finding, ResearchGap, ResearchPlan, ResearchTask } from "../types.js";

// ---------------------------------------------------------------------------
// LLM response shape
// ---------------------------------------------------------------------------

interface PlanJson {
  summary?: string;
  questions?: string[];
  searches?: Array<{ query?: string; reason?: string }>;
}

// ---------------------------------------------------------------------------
// Query Normalization and Deduplication Helpers (Phase 5)
// ---------------------------------------------------------------------------

function normalizeQueryText(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Deduplicate queries while preserving genuinely distinct research dimensions.
 */
export function deduplicateQueries(queries: string[]): string[] {
  const seenNorms = new Set<string>();
  const deduped: string[] = [];

  for (const q of queries) {
    const raw = q.trim();
    if (!raw || raw.length < 4) continue;

    const norm = normalizeQueryText(raw);
    if (seenNorms.has(norm)) continue;

    // Check if an existing query is practically identical (token Jaccard >= 0.85)
    const tokens = new Set(norm.split(" ").filter((t) => t.length > 2));
    let isNearDuplicate = false;

    for (const existingNorm of seenNorms) {
      const existingTokens = new Set(existingNorm.split(" ").filter((t) => t.length > 2));
      let intersection = 0;
      for (const t of tokens) {
        if (existingTokens.has(t)) intersection++;
      }
      const union = tokens.size + existingTokens.size - intersection;
      const jaccard = union > 0 ? intersection / union : 0;

      if (jaccard >= 0.85) {
        isNearDuplicate = true;
        break;
      }
    }

    if (!isNearDuplicate) {
      seenNorms.add(norm);
      deduped.push(raw);
    }
  }

  return deduped;
}

function heuristicQueries(
  goal: string,
  extraQueries: string[],
  gapQueries: string[],
): string[] {
  const cleaned = goal.replace(/\s+/g, " ").trim();
  const rawList = [
    cleaned,
    `${cleaned} peer-reviewed journal experimental conductivity`,
    `${cleaned} manufacturing scalability cost production $/kWh`,
    `${cleaned} quantitative performance comparison benchmark`,
    `${cleaned} open problems limitations degradation`,
    ...gapQueries,
    ...extraQueries,
  ];

  return deduplicateQueries(rawList);
}

function toTasks(
  searches: Array<{ query?: string; reason?: string }>,
  fallbackGoal: string,
  maxQueries: number,
): ResearchTask[] {
  const seenQueries = new Set<string>();
  const tasks: ResearchTask[] = [];

  for (const item of searches) {
    if (tasks.length >= maxQueries) break;
    const q = (item.query || fallbackGoal).trim();
    const norm = normalizeQueryText(q);
    if (!norm || seenQueries.has(norm)) continue;

    seenQueries.add(norm);
    tasks.push({
      id: id("task"),
      type: "search" as const,
      query: q,
      reason: item.reason || "Targeted investigation",
      done: false,
    });
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildFallbackPlan(
  goal: string,
  extraQueries: string[] = [],
  gaps: ResearchGap[] = [],
): ResearchPlan {
  const cfg = loopConfig();
  const maxQueries = cfg.maxQueriesPerRound;
  const gapQueries = [...gaps]
    .sort((a, b) => b.importance - a.importance)
    .map((g) => g.suggestedQuery)
    .filter(Boolean);

  const searches = heuristicQueries(goal, extraQueries, gapQueries).map((query) => ({
    query,
    reason: "Targeted investigation from critique/gap analysis",
  }));

  return {
    goal,
    summary: `Investigate: ${goal}`,
    questions: [
      "What is the current state of the field?",
      "Which sources are most cited or recent?",
      "Where do claims conflict?",
      "What remains unresolved?",
    ],
    tasks: toTasks(searches, goal, maxQueries),
    updatedAt: nowIso(),
  };
}

export async function buildPlan(
  goal: string,
  priorFindings: Finding[],
  extraQueries: string[],
  signal?: AbortSignal,
  model?: string,
  /** Phase 2: gaps from the previous critic/gap-detection round */
  gaps: ResearchGap[] = [],
): Promise<ResearchPlan> {
  const cfg = loopConfig();
  const maxQueries = cfg.maxQueriesPerRound;
  const useModel = resolveModel("smart", model);

  // Prioritize gaps by importance
  const gapQueries = [...gaps]
    .sort((a, b) => b.importance - a.importance)
    .map((g) => g.suggestedQuery)
    .filter(Boolean);

  const fallbackSearches = heuristicQueries(goal, extraQueries, gapQueries).map(
    (query) => ({
      query,
      reason: "Cover the goal from complementary angles",
    }),
  );

  const fallback: PlanJson = {
    summary: `Investigate: ${goal}`,
    questions: [
      "What is the current state of the field?",
      "Which sources are most cited or recent?",
      "Where do claims conflict?",
      "What remains unresolved?",
    ],
    searches: fallbackSearches,
  };

  const { value } = await chatJson<PlanJson>(
    [
      {
        role: "system",
        content:
          "You are the Anveshan orchestrator. Return JSON only with keys summary, questions (string[]), searches ({query, reason}[]). " +
          `Generate at most ${maxQueries} diverse, non-redundant academic queries. ` +
          "DIVERSITY CRITERIA: " +
          "1. Query 1: Peer-reviewed experimental literature (Nature/Science/ACS). " +
          "2. Query 2: Quantitative benchmarking & ionic conductivity values. " +
          "3. Query 3: Techno-economic cost ($/kWh, precursor costs) & manufacturing readiness. " +
          "4. Queries 4+: Focus on identified research gaps and conflicting mechanisms. " +
          "Do not repeat identical query phrases.",
      },
      {
        role: "user",
        content: JSON.stringify({
          goal,
          extraQueries,
          gapQueries,
          knownFindingCount: priorFindings.length,
          sampleFindings: priorFindings.slice(0, 8).map((f) => f.claim),
        }),
      },
    ],
    fallback,
    signal,
    useModel,
  );

  const rawSearches =
    (value.searches?.length ? value.searches : fallback.searches) ?? [];
  const tasks = toTasks(rawSearches, goal, maxQueries);

  return {
    goal,
    summary: value.summary || fallback.summary || goal,
    questions:
      value.questions?.length ? value.questions : fallback.questions || [],
    tasks,
    updatedAt: nowIso(),
  };
}
