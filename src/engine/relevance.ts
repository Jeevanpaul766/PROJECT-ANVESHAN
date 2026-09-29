/**
 * High-precision domain-agnostic relevance filter.
 * 100% deterministic (zero LLM overhead).
 * Rejects off-topic metadata and ensures sources share conceptual
 * keywords with the research goal or search query.
 */

import type { Source } from "./types.js";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "these", "those",
  "what", "when", "where", "which", "who", "why", "how", "all", "any",
  "both", "each", "few", "more", "most", "other", "some", "such", "than",
  "too", "very", "can", "will", "just", "should", "now", "are", "were",
  "been", "being", "have", "has", "had", "does", "did", "doing", "would",
  "could", "into", "through", "during", "before", "after", "above", "below",
  "latest", "recent", "study", "studies", "research", "findings", "review",
  "overview", "paper", "papers", "journal", "analysis", "experimental",
  "investigation", "approach", "advances", "advancements", "trends",
  "future", "perspectives", "progress",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d{4}$/.test(w));
}

export async function checkSourceRelevance(
  goal: string,
  taskQuery: string,
  source: Source,
  _signal?: AbortSignal,
): Promise<boolean> {
  const title = (source.title || "").toLowerCase();
  const snippet = (source.snippet || "").toLowerCase();
  const fullText = `${title} ${snippet}`;

  // 1. Reject peer-review comments metadata entries
  if (/^review for\s*"/i.test(title)) {
    return false;
  }

  // 2. Reject empty title or snippet
  if (!title.trim()) {
    return false;
  }

  // 3. Extract keywords from both the overall goal and the specific task query
  const goalKeywords = extractKeywords(goal);
  const queryKeywords = extractKeywords(taskQuery);
  const allKeywords = Array.from(new Set([...goalKeywords, ...queryKeywords]));

  // If query is too generic, allow source
  if (allKeywords.length === 0) {
    return true;
  }

  // 4. Check keyword overlap
  let titleMatches = 0;
  let totalMatches = 0;

  for (const kw of allKeywords) {
    if (title.includes(kw)) {
      titleMatches++;
      totalMatches++;
    } else if (snippet.includes(kw)) {
      totalMatches++;
    }
  }

  // Relevant if at least 1 keyword appears in the title,
  // or at least 2 keywords appear in the combined content (or all if < 2)
  if (titleMatches >= 1) {
    return true;
  }

  const threshold = Math.min(2, allKeywords.length);
  return totalMatches >= threshold;
}
