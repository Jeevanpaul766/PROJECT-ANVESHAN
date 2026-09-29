/**
 * Claim deduplication — Phase 2.
 *
 * Architecture:
 *   SimilarityProvider (interface)
 *     └── LexicalSimilarityProvider  ← default (no LLM, no vector DB)
 *         (future) EmbeddingProvider ← can replace without changing the API
 *
 * Deduplication strategy:
 *   1. URL-level dedup is already done in agents/search.ts (unchanged).
 *   2. This module clusters claims that are semantically similar
 *      by their statement text using Jaccard similarity over token sets.
 *   3. Claims are not deleted — they receive a `clusterId` pointing to
 *      the root (first-seen) claim in their cluster.
 *
 * Switching to embedding-based similarity later requires only:
 *   - Implementing `SimilarityProvider`
 *   - Passing the implementation to `deduplicateClaims()`
 */

import type { Claim } from "./types.js";

// ---------------------------------------------------------------------------
// SimilarityProvider interface
// ---------------------------------------------------------------------------

/**
 * Abstraction over text similarity implementations.
 * The default is lexical (Jaccard). An embedding-based implementation
 * can replace this without changing `deduplicateClaims()`.
 */
export interface SimilarityProvider {
  /**
   * Compute similarity between two strings.
   * Must return a value in [0, 1] where 1 = identical, 0 = no overlap.
   */
  similarity(a: string, b: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Lexical (Jaccard) implementation
// ---------------------------------------------------------------------------

/** Tokenize text into a set of lower-case alpha-numeric tokens (≥3 chars). */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

/** Jaccard similarity: |A ∩ B| / |A ∪ B| */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return intersection / union;
}

/**
 * Default similarity provider — token-level Jaccard similarity.
 * Deterministic and requires no external calls.
 */
export class LexicalSimilarityProvider implements SimilarityProvider {
  async similarity(a: string, b: string): Promise<number> {
    return jaccard(tokenize(a), tokenize(b));
  }
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Similarity threshold above which two claims are considered duplicates. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.65;

/**
 * Cluster claims by statement similarity.
 *
 * Returns a new array of claims where each claim has `clusterId` set to:
 * - Its own `id` if it is the first (root) claim in a cluster.
 * - The `id` of the earliest similar claim if it is a duplicate.
 *
 * The caller decides what to do with duplicates (display, filter, etc.).
 *
 * @param claims - Input claims (order-stable output)
 * @param threshold - Jaccard similarity threshold (0–1, default 0.65)
 * @param provider - Similarity implementation (defaults to lexical Jaccard)
 */
export async function deduplicateClaims(
  claims: Claim[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
  provider: SimilarityProvider = new LexicalSimilarityProvider(),
): Promise<Claim[]> {
  if (claims.length === 0) return [];

  // Map from claim.id → clusterId (root claim id)
  const clusterOf = new Map<string, string>();

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    let assignedCluster: string | null = null;

    for (let j = 0; j < i; j++) {
      const other = claims[j];
      const sim = await provider.similarity(claim.statement, other.statement);
      if (sim >= threshold) {
        // Assign to the same cluster as `other`
        assignedCluster = clusterOf.get(other.id) ?? other.id;
        break;
      }
    }

    clusterOf.set(claim.id, assignedCluster ?? claim.id);
  }

  return claims.map((c) => ({
    ...c,
    clusterId: clusterOf.get(c.id) ?? null,
  }));
}

/**
 * Count how many claims are duplicates (not their own cluster root).
 */
export function countDuplicates(claims: Claim[]): number {
  return claims.filter((c) => c.clusterId !== null && c.clusterId !== c.id).length;
}

/**
 * Return only the root (representative) claim from each cluster.
 * Useful for synthesis where you want unique perspectives only.
 */
export function dedupedRoots(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.clusterId === null || c.clusterId === c.id);
}
