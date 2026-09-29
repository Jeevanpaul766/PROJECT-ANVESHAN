/**
 * Synthesizer agent: goal + findings + claims + critiques → Markdown report string.
 * Spec: plans/modules/M08-synthesizer.md
 * Phase 4.2: Robust offline fallbacks, deduplicated critique sections,
 *             optimized synthesis prompt payload, and publication-grade output.
 */

import { chat } from "../llm.js";
import { resolveModel } from "../config.js";
import { nowIso } from "../ids.js";
import {
  buildCitationMap,
  buildCitationMapFromFindings,
  renderCitationSection,
  getCitationIndex,
} from "../citations.js";
import { dedupedRoots } from "../dedup.js";
import type { Claim, Contradiction, Critique, Finding, ResearchPlan } from "../types.js";

// ---------------------------------------------------------------------------
// Offline template (Robust fallback when LLM is offline/exhausted)
// ---------------------------------------------------------------------------

function offlineReport(
  goal: string,
  plan: ResearchPlan | null,
  findings: Finding[],
  claims: Claim[],
  critiques: Critique[],
  contradictions: Contradiction[],
): string {
  const ts = nowIso();
  const citationMap =
    claims.length > 0
      ? buildCitationMap(claims, findings)
      : buildCitationMapFromFindings(findings);

  const summary = plan?.summary ?? `Comprehensive investigation into: ${goal}`;

  const searchedLines =
    plan?.tasks.length
      ? plan.tasks.map((t) => `- ${t.query}`).join("\n")
      : `- ${goal}`;

  // Use claim statements if available, else fall back to finding claims
  const findingLines =
    claims.length > 0
      ? dedupedRoots(claims)
          .map((c) => {
            const finding = findings.find((f) => f.id === c.sourceId);
            const idx = finding ? getCitationIndex(finding, citationMap) : undefined;
            const ref = idx !== undefined ? ` [${idx}]` : "";
            return `- ${c.statement}${ref}`;
          })
          .join("\n")
      : findings.length
      ? findings
          .map((f) => {
            const idx = getCitationIndex(f, citationMap);
            const ref = idx !== undefined ? ` [${idx}]` : "";
            return `- ${f.claim}${ref}`;
          })
          .join("\n")
      : "_No findings collected yet._";

  // Deduplicate weaknesses
  const uniqueWeaknesses = [
    ...new Set(critiques.flatMap((c) => c.weaknesses)),
  ];
  const conflictLines = uniqueWeaknesses.length
    ? uniqueWeaknesses.map((w) => `- ${w}`).join("\n")
    : "_No major weaknesses identified._";

  // Include contradictions in the conflict section
  const contradictionLines = contradictions.length
    ? contradictions
        .map((c) => `- **Contradiction (severity ${(c.severity * 100).toFixed(0)}%)**: ${c.explanation}`)
        .join("\n")
    : "";

  // Deduplicate open angles
  const uniqueOpenAngles = [
    ...new Set(critiques.flatMap((c) => c.missingAngles)),
  ];
  const openLines = uniqueOpenAngles.length
    ? uniqueOpenAngles.map((a) => `- ${a}`).join("\n")
    : plan?.questions.length
    ? plan.questions.map((q) => `- ${q}`).join("\n")
    : "- What are the key open problems and unresolved challenges?\n- What promising directions remain underexplored?";

  const conflictSection = [conflictLines, contradictionLines]
    .filter(Boolean)
    .join("\n");

  // Build a quantitative table from claims with numeric data (domain-agnostic)
  const numericPattern = /\d+\.?\d*\s*(?:×\s*10\^?\d+\s*)?(?:%|°[CF]|[kKMGT]?(?:Hz|W|Wh|J|Pa|N|m|g|L|mol|s|A|V|Ω|S|b|B|eV|cal|bar)|(?:nm|μm|mm|cm|km|mg|kg|mL|dB|pp[mbth]|fps|rpm|USD|EUR|\$|¥|£|cycles?|mAh|Ah|mS|kWh|GWh|MPa|GPa|kPa|FLOPS?|tokens?))/i;
  const quantitativeClaims = claims.filter((c) =>
    numericPattern.test(c.statement) || numericPattern.test(c.evidence),
  );

  const quantitativeTable = quantitativeClaims.length > 0
    ? [
        "### Key Quantitative Data",
        "",
        "| Subject | Quantitative Finding | Source |",
        "|---|---|---|",
        ...quantitativeClaims.slice(0, 15).map((c) => {
          const finding = findings.find((f) => f.id === c.sourceId);
          const idx = finding ? getCitationIndex(finding, citationMap) : undefined;
          const ref = idx !== undefined ? `[${idx}]` : "—";
          return `| ${c.statement.replace(/\|/g, "\\|")} | ${c.evidence.slice(0, 100).replace(/\|/g, "\\|")} | ${ref} |`;
        }),
      ].join("\n")
    : "";

  return [
    `# ${goal}`,
    "",
    `_Generated: ${ts}_`,
    "",
    "## Executive summary",
    "",
    summary,
    "",
    "## What we searched",
    "",
    searchedLines,
    "",
    "## Key findings",
    "",
    findingLines,
    "",
    quantitativeTable,
    "",
    "## Conflicts, contradictions, and their root causes",
    "",
    conflictSection || "_No conflicts identified yet._",
    "",
    "## Open questions and future directions",
    "",
    openLines,
    "",
    renderCitationSection(citationMap, findings),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// URL safety guard
// ---------------------------------------------------------------------------

function stripHallucinatedLinks(
  report: string,
  allowedUrls: Set<string>,
): string {
  return report.replace(
    /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi,
    (match, label, href: string) => {
      if (allowedUrls.has(href.toLowerCase().trim())) return match;
      return label;
    },
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function writeReport(
  goal: string,
  plan: ResearchPlan | null,
  findings: Finding[],
  critiques: Critique[],
  signal?: AbortSignal,
  model?: string,
  /** Phase 2: atomic claims for precise citation mapping */
  claims: Claim[] = [],
  /** Phase 2: detected contradictions to include in the conflict section */
  contradictions: Contradiction[] = [],
): Promise<string> {
  // Build citation map — prefer claim-backed if available
  const citationMap =
    claims.length > 0
      ? buildCitationMap(claims, findings)
      : buildCitationMapFromFindings(findings);

  const allowedUrls = new Set(
    [...citationMap.indexByUrl.keys()].map((u) => u.toLowerCase().trim()),
  );

  // Always build offline report as structural scaffold + fallback
  const offline = offlineReport(goal, plan, findings, claims, critiques, contradictions);

  if (!findings.length) return offline;

  // ── LLM path ──────────────────────────────────────────────────────────────
  const useModel = model ?? resolveModel("smart");

  // Build compact source reference index for the LLM with venue/year tags (cap at top 35)
  const sourceTableLines = [...citationMap.indexByUrl.entries()]
    .sort(([, a], [, b]) => a - b)
    .slice(0, 35)
    .map(([urlKey, idx]) => {
      const finding = findings.find(
        (f) => f.source.url.toLowerCase().trim() === urlKey,
      );
      if (!finding) return "";
      const year = finding.source.year ? `, ${finding.source.year}` : "";
      const venue = finding.source.venue ? ` [${finding.source.venue}]` : "";
      return `[${idx}] ${finding.source.title}${venue} (${finding.source.kind}${year})`;
    })
    .filter(Boolean);

  // Use deduped claim roots if available, capped at 30 to stay well under token budgets
  const claimsList =
    claims.length > 0
      ? dedupedRoots(claims)
          .slice(0, 30)
          .map((c) => {
            const finding = findings.find((f) => f.id === c.sourceId);
            const idx = finding ? getCitationIndex(finding, citationMap) : undefined;
            const ref = idx !== undefined ? ` [${idx}]` : "";
            return `- ${c.statement}${ref}`;
          })
          .join("\n")
      : findings
          .slice(0, 25)
          .map((f) => {
            const idx = getCitationIndex(f, citationMap);
            const ref = idx !== undefined ? ` [${idx}]` : "";
            return `- ${f.claim}${ref}`;
          })
          .join("\n");

  const contradictionSection = contradictions.length
    ? `Detected contradictions:\n${contradictions.slice(0, 5).map((c) => `- ${c.explanation} (severity: ${(c.severity * 100).toFixed(0)}%)`).join("\n")}`
    : "";

  const uniqueWeaknesses = [...new Set(critiques.flatMap((c) => c.weaknesses))].slice(0, 6);
  const uniqueOpenAngles = [...new Set(critiques.flatMap((c) => c.missingAngles))].slice(0, 6);

  const prompt = [
    `Research goal: ${goal}`,
    "",
    "Write a comprehensive, publication-grade Markdown research report with EXACTLY these sections (H2 headings):",
    "  ## Executive summary",
    "  ## What we searched",
    "  ## Key findings",
    "  ## Quantitative comparison",
    "  ## Conflicts, contradictions, and their root causes",
    "  ## Open questions and future directions",
    "  ## Sources",
    "",
    "QUALITY RULES:",
    "1. QUANTITATIVE COMPARISON: Where the evidence contains numeric data, compile a Markdown comparison table with columns appropriate to the research domain. Include units and cite sources with [n].",
    "",
    "2. STRUCTURED FINDINGS: In '## Key findings', organize content into logical subsections (H3 headings) appropriate to the research topic. Group by theme, category, or methodology as fits the domain.",
    "",
    "3. CONTRADICTION ANALYSIS: In '## Conflicts', explain root causes for any conflicting claims — differing methods, conditions, populations, or measurement approaches.",
    "",
    "4. Use [n] inline citations from the source table below. Do NOT invent URLs.",
    "5. The ## Sources section must list every source using format: [n] Title [Venue] — URL (kind, year)",
    "6. Return ONLY the Markdown, no code fences, no extra commentary.",
    "",
    "Source index (use these [n] numbers):",
    ...sourceTableLines,
    "",
    "Claims with citation refs:",
    claimsList,
    "",
    uniqueWeaknesses.length
      ? `Identified weaknesses:\n${uniqueWeaknesses.map((w) => `- ${w}`).join("\n")}`
      : "",
    uniqueOpenAngles.length
      ? `Open angles:\n${uniqueOpenAngles.map((a) => `- ${a}`).join("\n")}`
      : "",
    contradictionSection,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const result = await chat(
    [
      {
        role: "system",
        content:
          "You are the Anveshan synthesizer — a world-class research analyst and technical writer. " +
          "You write exhaustive, deeply evidenced research reports in Markdown. " +
          "Adapt your analysis to the specific research domain. " +
          "Include quantitative data where available, identify contradictions and their root causes, and highlight open questions. " +
          "Never fabricate URLs — only use the provided numbered sources.",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0.2, signal, model: useModel, maxTokens: 2200 },
  );

  if (!result.usedModel || !result.text.trim()) return offline;

  let report = result.text.trim();

  // Ensure the report starts with the goal as H1
  if (!report.startsWith("# ")) {
    report = `# ${goal}\n\n${report}`;
  }

  // Ensure ## Sources section is present and correct
  if (!/^## Sources/m.test(report)) {
    report = `${report}\n\n${renderCitationSection(citationMap, findings)}`;
  }

  // Safety: strip any hallucinated inline Markdown links
  report = stripHallucinatedLinks(report, allowedUrls);

  return report;
}
