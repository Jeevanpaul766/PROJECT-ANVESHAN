/**
 * Evidence / Claim extractor — Phase 2/4: Batched Extraction & Model Tiering.
 *
 * Takes Findings (source + snippet) and extracts atomic, grounded claims.
 * Batches 5–8 findings per LLM request to reduce call volume by up to 85%
 * while preserving finding IDs and claim-source association.
 *
 * Rules enforced:
 * - Uses the FAST model tier (e.g. qwen2.5:7b for Ollama, openai/gpt-oss-20b for Groq)
 * - Retains original findingId for each claim
 * - Robust fallback per finding if batch parsing fails
 * - Never throws
 */

import { chatJson } from "../llm.js";
import { resolveModel } from "../config.js";
import { id, nowIso } from "../ids.js";
import type { Claim, Finding } from "../types.js";

// ---------------------------------------------------------------------------
// LLM response shape for Batched Extraction
// ---------------------------------------------------------------------------

interface RawClaim {
  statement?: unknown;
  evidence?: unknown;
  confidence?: unknown;
  relevance?: unknown;
}

interface FindingClaimsResult {
  findingId?: unknown;
  claims?: RawClaim[];
}

interface BatchExtractionResponse {
  results?: FindingClaimsResult[];
  claims?: RawClaim[]; // fallback for single-finding responses
}

// ---------------------------------------------------------------------------
// Deterministic fallback (when LLM is rate-limited or unavailable)
// ---------------------------------------------------------------------------

export function buildDeterministicClaims(finding: Finding): Claim[] {
  const text = (finding.source.snippet || finding.summary || finding.source.title || "").trim();
  if (!text || text.length < 15) return [];

  // Split into sentences and find sentences with relevant technical content
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length === 0) {
    return [
      {
        id: id("claim"),
        sourceId: finding.id,
        statement: finding.source.title,
        evidence: text.slice(0, 200),
        confidence: 0.6,
        relevance: 0.7,
        quality: 0.5,
        clusterId: null,
        createdAt: nowIso(),
      },
    ];
  }

  return sentences.slice(0, 2).map((sentence) => ({
    id: id("claim"),
    sourceId: finding.id,
    statement: sentence,
    evidence: sentence,
    confidence: 0.7,
    relevance: 0.75,
    quality: 0.6,
    clusterId: null,
    createdAt: nowIso(),
  }));
}

// ---------------------------------------------------------------------------
// Batched Extraction API (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Extract claims from a batch of findings in a single structured LLM call.
 * Retains findingId mappings and validates each claim.
 */
export async function extractClaimsBatch(
  goal: string,
  findings: Finding[],
  signal?: AbortSignal,
  model?: string,
  batchSize = 8,
): Promise<Claim[]> {
  if (findings.length === 0) return [];

  // Model Tiering: Resolve to the FAST model tier
  const useModel = resolveModel("fast", model);
  const allClaims: Claim[] = [];

  // Chunk findings into batches of batchSize (default 8)
  const chunks: Finding[][] = [];
  for (let i = 0; i < findings.length; i += batchSize) {
    const chunk = findings.slice(i, i + batchSize);
    const validChunk = chunk.filter((f) => {
      const content = (f.source.snippet || f.summary || f.source.title || "").trim();
      return content.length >= 20;
    });

    if (validChunk.length > 0) {
      chunks.push(validChunk);
    }
  }

  if (chunks.length === 0) return [];

  // Bounded worker pool: concurrency = 2
  const concurrency = 2;
  const chunkResults: Claim[][] = new Array(chunks.length);
  let nextChunkIndex = 0;

  async function worker(workerId: number): Promise<void> {
    while (true) {
      if (signal?.aborted) break;
      const idx = nextChunkIndex++;
      if (idx >= chunks.length) break;

      const validChunk = chunks[idx];
      const payload = validChunk.map((f) => ({
        findingId: f.id,
        title: f.source.title,
        url: f.source.url,
        text: (f.source.snippet || f.summary || f.source.title || "").slice(0, 1_200),
      }));

      const batchStartTime = Date.now();
      console.log(`[extraction] Worker ${workerId} started Batch ${idx + 1}/${chunks.length} at ${new Date().toISOString()} (${validChunk.length} sources)`);

      const { value, usedModel } = await chatJson<BatchExtractionResponse>(
        [
          {
            role: "system",
            content:
              "You are an evidence extraction engine for academic research. " +
              "Given multiple source texts, extract factual, quantitative claims relevant to the research goal. " +
              "Return ONLY valid JSON with key 'results' (an array of objects, one per source). " +
              "Each object must have:\n" +
              "  'findingId': string (MUST match the source's findingId),\n" +
              "  'claims': array of at most 2 claim objects, each with:\n" +
              "    statement (string — one factual sentence),\n" +
              "    evidence (string — concise supporting quote or close paraphrase, maximum 25 words),\n" +
              "    confidence (number 0–1),\n" +
              "    relevance (number 0–1).\n" +
              "CRITICAL: Always extract exact quantitative data, metrics, and units (e.g. '3.5 × 10⁻⁴ S/cm', '1.0 mA/cm²', '$80/kWh'). " +
              "Never invent information not present in the source text.",
          },
          {
            role: "user",
            content: JSON.stringify({
              goal,
              sources: payload,
            }),
          },
        ],
        { results: [] },
        signal,
        useModel,
      );

      const batchDuration = Date.now() - batchStartTime;
      console.log(`[extraction] Worker ${workerId} completed Batch ${idx + 1}/${chunks.length} in ${batchDuration}ms at ${new Date().toISOString()}`);

      const claimsForChunk: Claim[] = [];
      const chunkProcessedFindingIds = new Set<string>();

      if (usedModel && Array.isArray(value.results) && value.results.length > 0) {
        for (const res of value.results) {
          const findingId = typeof res.findingId === "string" ? res.findingId : "";
          const rawClaims = Array.isArray(res.claims) ? res.claims : [];
          if (!findingId || rawClaims.length === 0) continue;

          chunkProcessedFindingIds.add(findingId);

          for (const item of rawClaims.slice(0, 4)) {
            const statement = typeof item.statement === "string" ? item.statement.trim() : "";
            const evidence = typeof item.evidence === "string" ? item.evidence.trim() : "";
            const confidence = clamp(Number(item.confidence));
            const relevance = clamp(Number(item.relevance));

            if (!statement || !evidence || statement.length < 5) continue;

            claimsForChunk.push({
              id: id("claim"),
              sourceId: findingId,
              statement,
              evidence,
              confidence,
              relevance,
              quality: 0,
              clusterId: null,
              createdAt: nowIso(),
            });
          }
        }
      }

      // Deterministic fallback for any findings in this chunk that were missed by the LLM
      for (const f of validChunk) {
        if (!chunkProcessedFindingIds.has(f.id)) {
          const fallbackClaims = buildDeterministicClaims(f);
          claimsForChunk.push(...fallbackClaims);
        }
      }

      chunkResults[idx] = claimsForChunk;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, (_, wId) =>
    worker(wId + 1),
  );
  await Promise.all(workers);

  for (const res of chunkResults) {
    if (res) allClaims.push(...res);
  }

  return allClaims;
}

// ---------------------------------------------------------------------------
// Backward-compatible single-finding API
// ---------------------------------------------------------------------------

export async function extractClaims(
  goal: string,
  finding: Finding,
  signal?: AbortSignal,
  model?: string,
): Promise<Claim[]> {
  return extractClaimsBatch(goal, [finding], signal, model, 1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
