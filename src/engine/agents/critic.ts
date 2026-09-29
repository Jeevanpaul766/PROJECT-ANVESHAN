/**
 * Critic agent: read current findings → strengths, weaknesses, gaps, next queries.
 * Spec: plans/modules/M07-critic.md
 * Phase 2: extended with contradiction detection and quality/gap awareness.
 *
 * Does NOT write to disk. The caller (M09 / research loop) persists via the store.
 */

import { chatJson } from "../llm.js";
import { resolveModel } from "../config.js";
import { id, nowIso } from "../ids.js";
import type { Claim, Contradiction, Critique, Finding, SourceKind } from "../types.js";

// ---------------------------------------------------------------------------
// Offline / stats-based fallback helpers (unchanged from M07)
// ---------------------------------------------------------------------------

function kindCounts(findings: Finding[]): Record<SourceKind, number> {
  const counts: Record<SourceKind, number> = {
    arxiv: 0,
    "semantic-scholar": 0,
    web: 0,
    brave: 0,
    pubmed: 0,
    crossref: 0,
  };
  for (const f of findings) {
    const k = f.source.kind as SourceKind;
    if (k in counts) counts[k]++;
  }
  return counts;
}

function yearRange(findings: Finding[]): { min: number; max: number } | null {
  const years = findings
    .map((f) => f.source.year)
    .filter((y): y is number => typeof y === "number" && y > 1900);
  if (!years.length) return null;
  return { min: Math.min(...years), max: Math.max(...years) };
}

function missingYears(
  range: { min: number; max: number } | null,
  findings: Finding[],
): number[] {
  if (!range) return [];
  const present = new Set(
    findings
      .map((f) => f.source.year)
      .filter((y): y is number => typeof y === "number"),
  );
  const missing: number[] = [];
  for (let y = range.min; y <= range.max; y++) {
    if (!present.has(y)) missing.push(y);
  }
  return missing;
}

function buildFallback(goal: string, findings: Finding[]): Critique {
  const counts = kindCounts(findings);
  const range = yearRange(findings);
  const absent = missingYears(range, findings);
  const total = findings.length;

  const strengths: string[] = [
    `${total} source${total !== 1 ? "s" : ""} collected so far.`,
  ];
  const kindList = (
    Object.entries(counts) as [SourceKind, number][]
  )
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  if (kindList) strengths.push(`Source mix includes: ${kindList}.`);

  const weaknesses: string[] = [];
  if (counts.web + counts.brave > counts.arxiv + counts["semantic-scholar"]) {
    weaknesses.push("Web results dominate; fewer peer-reviewed abstracts.");
  }
  if (range && range.max - range.min < 2) {
    weaknesses.push("Year coverage is narrow — may miss older or newer work.");
  }
  if (total < 5) {
    weaknesses.push("Very few findings; results may not be representative.");
  }
  if (!weaknesses.length) {
    weaknesses.push("Some sources may lack full-text abstracts (web-only links).");
  }

  const missingAngles: string[] = [
    "Conflicting results and contradictory claims.",
    "Limitations and failure modes of proposed approaches.",
  ];
  if (absent.length > 0) {
    missingAngles.push(
      `Year gap(s) detected: ${absent.slice(0, 3).join(", ")} — may have relevant publications.`,
    );
  }

  const nextQueries: string[] = [
    `${goal} limitations`,
    `${goal} comparison`,
  ];
  for (const y of absent.slice(0, 2)) {
    nextQueries.push(`${goal} ${y}`);
  }
  return {
    createdAt: nowIso(),
    strengths,
    weaknesses,
    missingAngles,
    nextQueries: nextQueries.filter(Boolean).slice(0, 4),
  };
}

// ---------------------------------------------------------------------------
// LLM-based critique (Phase 2: enriched with claim quality data)
// ---------------------------------------------------------------------------

interface CritiqueJson {
  strengths?: string[];
  weaknesses?: string[];
  missingAngles?: string[];
  nextQueries?: string[];
}

export async function critiqueFindings(
  goal: string,
  findings: Finding[],
  signal?: AbortSignal,
  model?: string,
  /** Phase 2: pass extracted claims for richer quality analysis */
  claims: Claim[] = [],
): Promise<Critique> {
  const fallback = buildFallback(goal, findings);
  const useModel = model ?? resolveModel("smart");

  // Build quality summary from claims
  const highConf = claims.filter((c) => c.confidence >= 0.7).length;
  const lowConf = claims.filter((c) => c.confidence < 0.4).length;
  const avgRelevance =
    claims.length > 0
      ? (claims.reduce((s, c) => s + c.relevance, 0) / claims.length).toFixed(2)
      : "unknown";

  // Phase 4: Source diversity analysis
  const counts = kindCounts(findings);
  const totalFindings = findings.length;
  const dominantKind = (Object.entries(counts) as [SourceKind, number][])
    .sort(([, a], [, b]) => b - a)[0];
  const dominantPercent = totalFindings > 0 
    ? Math.round((dominantKind[1] / totalFindings) * 100) 
    : 0;
  const sourceDiversityWarning = dominantPercent > 80
    ? `WARNING: ${dominantPercent}% of sources are from ${dominantKind[0]}. Need more diversity.`
    : null;

  // Phase 4: Quantitative depth check — domain-agnostic numeric detection
  const numericPattern = /\d+\.?\d*\s*(?:×\s*10\^?\d+\s*)?(?:%|°[CF]|[kKMGT]?(?:Hz|W|Wh|J|Pa|N|m|g|L|mol|s|A|V|Ω|S|b|B|eV|cal|bar)|(?:nm|μm|mm|cm|km|mg|kg|mL|dB|pp[mbth]|fps|rpm|USD|EUR|\$|¥|£|cycles?|mAh|Ah|mS|kWh|GWh|MPa|GPa|kPa|FLOPS?|tokens?))/i;
  const claimsWithNumbers = claims.filter((c) => numericPattern.test(c.statement) || numericPattern.test(c.evidence));
  const quantitativePercent = claims.length > 0
    ? Math.round((claimsWithNumbers.length / claims.length) * 100)
    : 0;
  const quantitativeWarning = quantitativePercent < 30
    ? `WARNING: Only ${quantitativePercent}% of claims contain quantitative data with units. Need more numeric evidence.`
    : null;

  // Phase 4: Recency check
  const currentYear = new Date().getFullYear();
  const recentFindings = findings.filter((f) => f.source.year && f.source.year >= currentYear - 2);
  const recencyPercent = totalFindings > 0
    ? Math.round((recentFindings.length / totalFindings) * 100)
    : 0;
  const recencyWarning = recencyPercent < 40
    ? `NOTE: Only ${recencyPercent}% of sources are from the last 2 years. Consider searching for more recent work.`
    : null;

  const { value, usedModel } = await chatJson<CritiqueJson>(
    [
      {
        role: "system",
        content:
          "You are the Anveshan critic. Your job is to review research findings and identify weaknesses, gaps, and follow-up queries. " +
          "Return ONLY valid JSON with exactly these keys: strengths (string[]), weaknesses (string[]), missingAngles (string[]), nextQueries (string[]). " +
          "EVALUATE CRITICALLY: " +
          "1. Source diversity — are there enough peer-reviewed journal papers vs preprints? " +
          "2. Quantitative depth — do claims include numeric values with units (conductivity, cycles, cost)? " +
          "3. Manufacturing & scalability — is there coverage of production methods, cost, and scale-up? " +
          "4. Contradiction resolution — are conflicting claims analyzed for root causes? " +
          "5. Recency — are the most recent developments (last 2 years) well represented? " +
          "For nextQueries: generate search strings that SPECIFICALLY target: " +
          "  - Peer-reviewed journals (add 'journal' or 'Nature' or 'Science' to query) " +
          "  - Quantitative benchmarks (add 'performance comparison' or 'experimental results') " +
          "  - Manufacturing data (add 'manufacturing' or 'scalability' or 'cost analysis') " +
          "Keep nextQueries to at most 4 short, focused academic search strings. Do not write prose outside the JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          goal,
          findingCount: findings.length,
          sourceKinds: counts,
          yearRange: yearRange(findings),
          sampleClaims: findings.slice(0, 10).map((f) => f.claim),
          // Phase 2: claim quality metrics
          claimCount: claims.length,
          highConfidenceClaims: highConf,
          lowConfidenceClaims: lowConf,
          averageRelevance: avgRelevance,
          // Phase 4: quality diagnostics
          sourceDiversityWarning,
          quantitativeDepthPercent: quantitativePercent,
          quantitativeWarning,
          recencyWarning,
        }),
      },
    ],
    {},
    signal,
    useModel,
  );

  if (!usedModel) return fallback;

  const strengths =
    Array.isArray(value.strengths) && value.strengths.length > 0
      ? value.strengths.map(String)
      : fallback.strengths;

  // Merge LLM weaknesses with our automated quality checks
  const llmWeaknesses =
    Array.isArray(value.weaknesses) && value.weaknesses.length > 0
      ? value.weaknesses.map(String)
      : fallback.weaknesses;
  
  const autoWeaknesses = [sourceDiversityWarning, quantitativeWarning, recencyWarning]
    .filter((w): w is string => w !== null);
  
  const weaknesses = [...new Set([...llmWeaknesses, ...autoWeaknesses])];

  const missingAngles =
    Array.isArray(value.missingAngles) && value.missingAngles.length > 0
      ? value.missingAngles.map(String)
      : fallback.missingAngles;

  const rawQueries = Array.isArray(value.nextQueries)
    ? value.nextQueries.map(String).filter((q) => q.trim().length > 0)
    : [];
  const nextQueries =
    rawQueries.length > 0 ? rawQueries.slice(0, 4) : fallback.nextQueries;

  return {
    createdAt: nowIso(),
    strengths,
    weaknesses,
    missingAngles,
    nextQueries,
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Contradiction detection (first-class structure)
// ---------------------------------------------------------------------------

interface ContradictionResponse {
  contradictions?: Array<{
    claimAIdx?: unknown;
    claimBIdx?: unknown;
    explanation?: unknown;
    severity?: unknown;
  }>;
}

/**
 * Detect contradicting claim pairs in the current evidence set.
 *
 * Uses the SMART model. Returns [] on failure (does not throw).
 * Samples at most 20 claims to keep the prompt manageable.
 *
 * @param claims - Extracted claims (ideally after deduplication)
 * @param signal - Optional abort signal
 * @param model - Optional model override
 */
export async function detectContradictions(
  claims: Claim[],
  signal?: AbortSignal,
  model?: string,
): Promise<Contradiction[]> {
  if (claims.length < 2) return [];

  const useModel = resolveModel("fast", model);

  const sample = claims.slice(0, 15).map((c) => ({
    id: c.id,
    statement: c.statement,
  }));

  const { value, usedModel } = await chatJson<ContradictionResponse>(
    [
      {
        role: "system",
        content:
          "You are a contradiction detector for scientific and academic claims. " +
          "Analyze the provided claims and identify pairs that directly conflict, " +
          "contradict each other, or report irreconcilable findings. " +
          "Return ONLY valid JSON with key 'contradictions' (array of objects). " +
          "Each object must have: " +
          "  claimAId (string — matching an id from input), " +
          "  claimBId (string — matching a different id from input), " +
          "  explanation (string — concise explanation of the conflict), " +
          "  severity (number 0–1 — 1 = direct logical contradiction, 0.5 = conflicting data). " +
          "Return AT MOST 4 contradictions. " +
          "If no contradictions exist, return { \"contradictions\": [] }.",
      },
      {
        role: "user",
        content: JSON.stringify({ claims: sample }),
      },
    ],
    { contradictions: [] },
    signal,
    useModel,
  );

  if (!usedModel) return [];

  const raw = Array.isArray(value.contradictions) ? value.contradictions : [];
  const result: Contradiction[] = [];

  for (const item of raw) {
    const aIdx = Number(item.claimAIdx);
    const bIdx = Number(item.claimBIdx);
    if (!Number.isInteger(aIdx) || !Number.isInteger(bIdx)) continue;
    if (aIdx < 0 || aIdx >= sample.length) continue;
    if (bIdx < 0 || bIdx >= sample.length) continue;
    const claimAId = sample[aIdx].id;
    const claimBId = sample[bIdx].id;
    if (!claimAId || !claimBId || claimAId === claimBId) continue;
    const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
    if (!explanation) continue;

    result.push({
      id: id("contra"),
      claimAId,
      claimBId,
      explanation,
      severity: clamp(Number(item.severity)),
      createdAt: nowIso(),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
