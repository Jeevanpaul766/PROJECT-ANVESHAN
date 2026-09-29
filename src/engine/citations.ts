/**
 * Citation mapping — Phase 2.
 *
 * Builds a precise Claim → Source → CitationIndex mapping.
 * The Synthesizer uses this instead of manually inventing source relationships.
 *
 * Flow:
 *   Claims (with sourceId = Finding.id)
 *     ↓
 *   buildCitationMap(claims, findings)
 *     ↓
 *   CitationMap { citations[], indexByUrl }
 *     ↓
 *   renderCitationSection() → "## Sources" Markdown
 */

import type { Citation, Claim, Finding } from "./types.js";

// ---------------------------------------------------------------------------
// CitationMap type
// ---------------------------------------------------------------------------

export interface CitationMap {
  /** All claim→source→index triplets */
  citations: Citation[];
  /** URL (lowercased) → citation index; for looking up [n] numbers in reports */
  indexByUrl: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a CitationMap from claims and findings.
 *
 * Each unique source URL gets a stable ascending citation index [1, 2, 3, …].
 * Claims that reference the same source share the same citation index.
 * Claims whose sourceId does not match any Finding are silently skipped.
 *
 * @param claims - Extracted claims (may include duplicates)
 * @param findings - All findings for the session
 */
export function buildCitationMap(
  claims: Claim[],
  findings: Finding[],
): CitationMap {
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const indexByUrl = new Map<string, number>();
  const citations: Citation[] = [];
  let nextIndex = 1;

  for (const claim of claims) {
    const finding = findingById.get(claim.sourceId);
    if (!finding) continue;

    const urlKey = finding.source.url.toLowerCase().trim();
    if (!urlKey) continue;

    // Assign a new index if this URL hasn't been seen yet
    let idx = indexByUrl.get(urlKey);
    if (idx === undefined) {
      idx = nextIndex++;
      indexByUrl.set(urlKey, idx);
    }

    citations.push({
      claimId: claim.id,
      sourceId: claim.sourceId,
      sourceUrl: finding.source.url,
      citationIndex: idx,
      claimStatement: claim.statement,
    });
  }

  return { citations, indexByUrl };
}

/**
 * Build a CitationMap directly from Findings (Phase 1 compat).
 * Used when no claims are available (old sessions or extraction failure).
 */
export function buildCitationMapFromFindings(findings: Finding[]): CitationMap {
  const indexByUrl = new Map<string, number>();
  const citations: Citation[] = [];
  let nextIndex = 1;

  for (const finding of findings) {
    const urlKey = finding.source.url.toLowerCase().trim();
    if (!urlKey || indexByUrl.has(urlKey)) continue;
    const idx = nextIndex++;
    indexByUrl.set(urlKey, idx);
    citations.push({
      claimId: "",
      sourceId: finding.id,
      sourceUrl: finding.source.url,
      citationIndex: idx,
      claimStatement: finding.claim,
    });
  }

  return { citations, indexByUrl };
}

/**
 * Render the `## Sources` section of a research report.
 * Uses the citation map to produce a stable, numbered source list.
 */
export function renderCitationSection(
  citationMap: CitationMap,
  findings: Finding[],
): string {
  if (citationMap.indexByUrl.size === 0) {
    return "## Sources\n\n_No sources collected._\n";
  }

  const findingByUrl = new Map(
    findings.map((f) => [f.source.url.toLowerCase().trim(), f]),
  );

  // Sort entries by citation index
  const entries = [...citationMap.indexByUrl.entries()]
    .sort(([, a], [, b]) => a - b)
    .map(([urlKey, idx]): string => {
      const finding = findingByUrl.get(urlKey);
      if (!finding) return "";
      const year = finding.source.year ? `, ${finding.source.year}` : "";
      return `[${idx}] ${finding.source.title} — ${finding.source.url} (${finding.source.kind}${year})`;
    })
    .filter(Boolean);

  return `## Sources\n\n${entries.join("\n")}\n`;
}

/**
 * Look up the citation index for a given Finding (by URL).
 * Returns undefined if the finding is not in the citation map.
 */
export function getCitationIndex(
  finding: Finding,
  citationMap: CitationMap,
): number | undefined {
  return citationMap.indexByUrl.get(finding.source.url.toLowerCase().trim());
}
