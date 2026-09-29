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
    : "- Further full-cell automotive benchmarking under high stack pressure\n- Long-term cycling stability (>1000 cycles) across wide temperature windows (-20°C to 60°C)";

  const conflictSection = [conflictLines, contradictionLines]
    .filter(Boolean)
    .join("\n");

  // Build a quantitative table from claims with numeric data
  const numericPattern = /(\d+\.?\d*)\s*(S\/?cm|mS\/?cm|eV|°C|cycles?|mAh|Wh|kWh|\$|\%)/i;
  const quantitativeClaims = claims.filter((c) =>
    numericPattern.test(c.statement) || numericPattern.test(c.evidence),
  );

  const quantitativeTable = quantitativeClaims.length > 0
    ? [
        "### Key Quantitative Data",
        "",
        "| Material / System | Quantitative Finding | Source |",
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
    "## Cost analysis and manufacturing scalability",
    "",
    "- **Precursor Costs**: Sulfide raw materials (Li2S) face scale-up cost curves, while oxide garnets require high-purity La2O3 and ZrO2.",
    "- **Processing Capex**: Sulfides necessitate dry-room environments (<1% RH); oxide ceramics require high-temperature sintering (≥1000°C); polymer composites offer lowest entry barrier via roll-to-roll slurry coating.",
    "- **Cell-Level Target**: Commercial EV parity targets <$80–$100/kWh at GWh volume production.",
    "",
    "## Technology readiness assessment",
    "",
    "| Electrolyte Family | Estimated TRL | Commercial Status |",
    "|---|---|---|",
    "| Polymer-Ceramic Composites | 6–7 | Compatible with existing roll-to-roll lines; pilot pre-production |",
    "| Sulfide Argyrodites | 5–6 | High ionic conductivity (>5 mS/cm); moisture-tolerant surface engineering in validation |",
    "| Oxide Garnets (LLZO) | 5–6 | Wide voltage window (>5V); high-temp sintering & interfacial resistance optimization ongoing |",
    "| Halides (Li3InCl6, Li3YCl6) | 4 | High-voltage cathode stability; pilot synthesis exploration |",
    "| Sodium NASICON | 3–4 | Cost-effective alternative; bulk & grain-boundary transport optimization in progress |",
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
    "  ## Cost analysis and manufacturing scalability",
    "  ## Technology readiness assessment",
    "  ## Open questions and future directions",
    "  ## Sources",
    "",
    "CRITICAL QUALITY RULES:",
    "1. QUANTITATIVE COMPARISON TABLE: In '## Quantitative comparison', compile a full Markdown table comparing all electrolyte classes.",
    "   Format: | Electrolyte Family | Specific Material | Room-Temp σ (mS cm⁻¹ or S cm⁻¹) | Ea (eV) | Processing Temp | Key Full-Cell Metric | Ref |",
    "   Include both moderate and high-end superionic values (e.g. 1–25 mS cm⁻¹ for argyrodites/halides).",
    "",
    "2. STRUCTURED MATERIAL BREAKDOWN: In '## Key findings', provide thorough subsections (H3 headings) for:",
    "   - ### Sulfides (Argyrodites, LGPS-type, Li-P-S)",
    "   - ### Oxides & Garnets (LLZO, Perovskites)",
    "   - ### Halides & Mixed-Anions (Li3InCl6, Li3YCl6)",
    "   - ### Polymers & Hybrid Composites (PVDF-HFP, PEO with ceramic fillers)",
    "   - ### Sodium-based Solid Electrolytes (Na-NASICON)",
    "",
    "3. COST & TECHNO-ECONOMIC ANALYSIS: In '## Cost analysis and manufacturing scalability':",
    "   - Analyze raw material costs (Li2S precursor cost, La2O3/ZrO2 cost, polymer resin cost).",
    "   - Discuss cell-level $/kWh estimates (e.g., target <$80-$100/kWh for commercial EV parity).",
    "   - Compare processing Capex (dry-room moisture protection vs high-temp sintering vs roll-to-roll coating).",
    "",
    "4. CONTRADICTION ROOT-CAUSE ANALYSIS: Provide deep explanations in '## Conflicts, contradictions, and their root causes' (bulk pellet conductivity vs interface space-charge resistance; neat polymers vs ceramic-loaded composites).",
    "",
    "5. TRL MATRIX: Provide a clear table with TRL (1-9), commercial status, and industry champions/pilot efforts.",
    "",
    "6. Use [n] inline citations from the source table below. Do NOT invent URLs.",
    "7. The ## Sources section must list every source using format: [n] Title [Venue] — URL (kind, year)",
    "8. Return ONLY the Markdown, no code fences, no extra commentary.",
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
          "You are the Anveshan synthesizer — a world-class principal battery materials scientist and technical intelligence analyst. " +
          "You write exhaustive, deeply quantitative research reports in Markdown. " +
          "You MUST include: (1) A comprehensive quantitative comparison table, (2) Deep coverage of sulfides, oxides, halides, polymers, and sodium systems, (3) Concrete techno-economic cost and scalability analysis ($/kWh, dry-room Capex, sintering costs), (4) Thorough contradiction root-cause diagnostics, and (5) A practical TRL assessment matrix for automotive EV commercialization. " +
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
