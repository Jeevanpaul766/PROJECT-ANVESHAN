/**
 * Source quality scoring — Phase 2.
 *
 * Scores sources deterministically from metadata where possible.
 * LLM is NOT used here — scoring is fast, free, and reproducible.
 *
 * All scores are normalized to 0–1.
 */

import type { Claim, Source, SourceKind, SourceScore } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

/** Authority scores by source kind — reflects typical academic rigor. */
const KIND_AUTHORITY: Record<SourceKind, number> = {
  pubmed: 0.92,
  arxiv: 0.85,
  crossref: 0.83,
  "semantic-scholar": 0.80,
  brave: 0.50,
  web: 0.40,
};

// ---------------------------------------------------------------------------
// Individual dimension scorers
// ---------------------------------------------------------------------------

function scoreAuthority(source: Source): number {
  return KIND_AUTHORITY[source.kind] ?? 0.45;
}

function scoreRecency(source: Source): number {
  if (!source.year) return 0.50; // Unknown — neither penalize nor reward
  const age = CURRENT_YEAR - source.year;
  if (age <= 0) return 1.00; // Current year
  if (age <= 1) return 0.95;
  if (age <= 2) return 0.85;
  if (age <= 3) return 0.75;
  if (age <= 5) return 0.65;
  if (age <= 10) return 0.50;
  return Math.max(0.10, 0.50 - (age - 10) * 0.02);
}

function scoreEvidenceQuality(source: Source): number {
  let score = 0.20; // Baseline: just having a URL
  if (source.snippet && source.snippet.length > 50) score += 0.35;
  if (source.snippet && source.snippet.length > 200) score += 0.15; // Long abstract
  if (source.authors && source.authors.length > 0) score += 0.15;
  if (source.venue) score += 0.10;
  if (source.year) score += 0.05;
  return Math.min(1.0, score);
}

function scoreRelevance(claims: Claim[]): number {
  if (claims.length === 0) return 0.50; // Unknown
  // Average claim relevance scores for this source
  const avg = claims.reduce((sum, c) => sum + c.relevance, 0) / claims.length;
  return Math.max(0, Math.min(1, avg));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a multi-dimensional quality score for a Source.
 *
 * @param source - The source to score
 * @param claims - Claims extracted from this source (used for relevance)
 * @returns SourceScore with all dimensions and an overall weighted score
 */
export function scoreSource(source: Source, claims: Claim[] = []): SourceScore {
  const authority = scoreAuthority(source);
  const recency = scoreRecency(source);
  const evidenceQuality = scoreEvidenceQuality(source);
  const relevance = scoreRelevance(claims);

  // Weighted combination: relevance is most important for research quality
  const overall = clamp(
    authority * 0.25 +
    relevance * 0.40 +
    recency * 0.20 +
    evidenceQuality * 0.15,
  );

  return { authority, relevance, recency, evidenceQuality, overall };
}

/**
 * Apply the quality score back to claims from a given source.
 * Modifies claims in-place (sets claim.quality = score.overall).
 */
export function applyClaims(claims: Claim[], score: SourceScore): Claim[] {
  return claims.map((c) => ({ ...c, quality: score.overall }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
