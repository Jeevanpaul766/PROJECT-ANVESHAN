/**
 * Search agent: plan search tasks → sourced Finding records.
 * Spec: plans/modules/M06-search-agent.md
 * Phase 3: Bounded parallel search execution via ANVESHAN_SEARCH_CONCURRENCY (default 4).
 *
 * Runs search queries concurrently up to the configured limit,
 * then processes and deduplicates the resulting findings.
 */

import { intEnv, loopConfig } from "../config.js";
import { id, nowIso } from "../ids.js";
import { createSearchManager } from "../search/manager.js";
import { checkSourceRelevance } from "../relevance.js";
import type { Finding, ResearchPlan, Source } from "../types.js";

export interface SearchRunResult {
  findings: Finding[];
  plan: ResearchPlan;
}

function confidenceFor(source: Source): number {
  if (source.kind === "arxiv" || source.kind === "semantic-scholar" || source.kind === "pubmed" || source.kind === "crossref") {
    return 0.65;
  }
  if (source.kind === "brave") {
    return 0.50;
  }
  return 0.45;
}

function claimFromSource(source: Source): string {
  const snippet = (source.snippet || "").replace(/\s+/g, " ").trim();
  const slice = snippet.slice(0, 240);
  if (slice) return `${source.title}: ${slice}`;
  return source.title;
}

function querySlug(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function urlKey(url: string): string {
  return url.toLowerCase().trim();
}

export async function runSearchTasks(
  goal: string,
  plan: ResearchPlan,
  existing: Finding[],
  signal?: AbortSignal,
): Promise<SearchRunResult> {
  const { maxSources } = loopConfig();
  const cap = maxSources;
  const seen = new Set(
    existing.map((f) => urlKey(f.source.url)).filter(Boolean),
  );
  const newFindings: Finding[] = [];
  const nextPlan: ResearchPlan = {
    ...plan,
    tasks: plan.tasks.map((t) => ({ ...t })),
    updatedAt: nowIso(),
  };

  const manager = createSearchManager();
  const concurrency = intEnv("ANVESHAN_SEARCH_CONCURRENCY", 4);

  // Get all pending search tasks
  const pendingTasks = nextPlan.tasks.filter((t) => t.type === "search" && !t.done);

  // Execute tasks in bounded parallel chunks
  for (let i = 0; i < pendingTasks.length; i += concurrency) {
    if (signal?.aborted) break;
    if (existing.length + newFindings.length >= cap) break;

    const taskBatch = pendingTasks.slice(i, i + concurrency);

    // Run the batch concurrently
    const batchResults = await Promise.all(
      taskBatch.map(async (task) => {
        try {
          const sources = await manager.search(task.query, { signal, limit: 5 });
          return { task, sources };
        } catch (err) {
          if (signal?.aborted) throw err;
          return { task, sources: [] };
        }
      }),
    );

    for (const { task, sources } of batchResults) {
      task.done = true;

      for (const source of sources) {
        if (existing.length + newFindings.length >= cap) break;
        if (!source.url || !source.title) continue;
        const key = urlKey(source.url);
        if (!key || seen.has(key)) continue;
        if (!/^https?:\/\//i.test(source.url)) continue;

        const isRelevant = await checkSourceRelevance(goal, task.query, source, signal);
        if (!isRelevant) {
          continue; // Discard obviously irrelevant results
        }

        seen.add(key);
        newFindings.push({
          id: id("find"),
          createdAt: nowIso(),
          agent: "search",
          claim: claimFromSource(source),
          summary: (source.snippet || source.title).slice(0, 700),
          source,
          confidence: confidenceFor(source),
          tags: [task.id, querySlug(task.query)].filter(Boolean),
        });
      }
    }
  }

  return { findings: newFindings, plan: nextPlan };
}
