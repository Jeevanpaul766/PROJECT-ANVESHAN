/**
 * Manual synthesizer probe for M08 acceptance.
 * Spec: plans/modules/M08-synthesizer.md
 *
 * Checks:
 *  1. Offline report contains ## Sources with ≥ finding-count listed URLs.
 *  2. No hallucinated URLs (report URLs ⊆ finding URLs).
 *  3. Report is a UTF-8 Markdown string (non-empty, contains required headings).
 */

import { writeReport } from "../engine/agents/synthesizer.js";
import type { Critique, Finding, ResearchPlan } from "../engine/types.js";

// ── stub data ─────────────────────────────────────────────────────────────────

const goal = "sulfide solid-state battery electrolytes";

const plan: ResearchPlan = {
  goal,
  summary:
    "Investigate ionic conductivity, moisture sensitivity, and scalability of sulfide-based solid-state electrolytes.",
  questions: [
    "What is the best ionic conductivity achieved?",
    "How is moisture sensitivity addressed?",
    "Which materials are closest to commercialisation?",
  ],
  tasks: [
    {
      id: "task_01",
      type: "search",
      query: "sulfide solid-state battery electrolyte conductivity",
      reason: "core query",
      done: true,
    },
    {
      id: "task_02",
      type: "search",
      query: "sulfide electrolyte moisture stability",
      reason: "known weakness",
      done: true,
    },
  ],
  updatedAt: new Date().toISOString(),
};

const findings: Finding[] = [
  {
    id: "find_01",
    createdAt: new Date().toISOString(),
    agent: "search",
    claim:
      "Li6PS5Cl argyrodite electrolytes achieve ionic conductivity up to 12 mS/cm at room temperature.",
    summary: "High conductivity argyrodite sulfide electrolytes reviewed.",
    source: {
      kind: "arxiv",
      title: "High-conductivity Argyrodite Sulfide Electrolytes",
      url: "https://arxiv.org/abs/2401.00001",
      year: 2024,
    },
    confidence: 0.65,
    tags: [],
  },
  {
    id: "find_02",
    createdAt: new Date().toISOString(),
    agent: "search",
    claim:
      "Moisture exposure to H2S causes rapid degradation of sulfide-based solid electrolytes.",
    summary: "Moisture stability of sulfide SSEs is a key challenge.",
    source: {
      kind: "semantic-scholar",
      title: "Moisture Sensitivity of Sulfide Electrolytes",
      url: "https://www.semanticscholar.org/paper/moisture-ssb-abc123",
      year: 2023,
    },
    confidence: 0.65,
    tags: [],
  },
  {
    id: "find_03",
    createdAt: new Date().toISOString(),
    agent: "search",
    claim:
      "Toyota has demonstrated prototype sulfide SSBs targeting 2027 mass production.",
    summary: "Toyota SSB commercialisation timeline overview.",
    source: {
      kind: "web",
      title: "Toyota Solid-State Battery Roadmap 2027",
      url: "https://example.com/toyota-ssb-2027",
    },
    confidence: 0.45,
    tags: [],
  },
];

const critiques: Critique[] = [
  {
    createdAt: new Date().toISOString(),
    strengths: ["3 sources from 2 academic databases and the web."],
    weaknesses: ["Web results dominate peer-reviewed sources."],
    missingAngles: [
      "Conflicting results and contradictory claims.",
      "Limitations and failure modes of proposed approaches.",
    ],
    nextQueries: [
      "sulfide electrolyte limitations 2024",
      "sulfide SSB comparison Li6PS5Cl vs LGPS",
    ],
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

const REQUIRED_HEADINGS = [
  "## Executive summary",
  "## What we searched",
  "## Findings",
  "## Conflicts and weak points",
  "## Open questions",
  "## Sources",
];

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]"'>]+/gi) ?? [];
  return [...new Set(matches.map((u) => u.toLowerCase().trim()))];
}

// ── run ───────────────────────────────────────────────────────────────────────

const report = await writeReport(goal, plan, findings, critiques);

// 1. Non-empty string
const isString = typeof report === "string" && report.trim().length > 0;

// 2. Required headings present
const headingsOk = REQUIRED_HEADINGS.every((h) => report.includes(h));

// 3. ## Sources section with ≥ finding URLs listed
const sourcesSection = report.match(/## Sources[\s\S]*/)?.[0] ?? "";
const listedSourceUrls = extractUrls(sourcesSection);
const findingUrls = new Set(
  findings.map((f) => f.source.url.toLowerCase().trim()),
);
const allSourcesListed = [...findingUrls].every((u) =>
  listedSourceUrls.some((lu) => lu.startsWith(u) || u.startsWith(lu)),
);
const sourceCountOk = listedSourceUrls.length >= findings.length;

// 4. No hallucinated URLs (all URLs in non-Sources body ⊆ finding URLs)
const bodySection = report.replace(/## Sources[\s\S]*/, "");
const bodyUrls = extractUrls(bodySection);
const hallucinated = bodyUrls.filter(
  (u) => !findingUrls.has(u) && ![...findingUrls].some((fu) => u.startsWith(fu)),
);
const noHallucinations = hallucinated.length === 0;

// ── report ────────────────────────────────────────────────────────────────────

console.log(
  JSON.stringify(
    {
      isString,
      headingsOk,
      missingHeadings: REQUIRED_HEADINGS.filter((h) => !report.includes(h)),
      sourceCountOk,
      listedSourceCount: listedSourceUrls.length,
      findingCount: findings.length,
      allSourcesListed,
      noHallucinations,
      hallucinated,
      reportPreview: report.slice(0, 600),
    },
    null,
    2,
  ),
);

console.log("\n--- Full Report ---\n");
console.log(report);

const pass =
  isString && headingsOk && sourceCountOk && allSourcesListed && noHallucinations;
process.exit(pass ? 0 : 1);
