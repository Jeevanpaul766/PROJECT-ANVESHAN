/**
 * Manual critic probe for M07 acceptance.
 * Spec: plans/modules/M07-critic.md
 *
 * Checks:
 *  1. Offline (no findings, no LLM): returns Critique with ≥1 nextQueries item.
 *  2. nextQueries are non-empty strings.
 *  3. critiqueFindings does NOT write to disk (disk check: file counts unchanged).
 */

import { critiqueFindings } from "../engine/agents/critic.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../engine/config.js";
import type { Finding } from "../engine/types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

async function countSessionFiles(): Promise<number> {
  try {
    const dirs = await readdir(DATA_DIR);
    let count = 0;
    for (const d of dirs) {
      const files = await readdir(join(DATA_DIR, d)).catch(() => [] as string[]);
      count += files.length;
    }
    return count;
  } catch {
    return 0;
  }
}

// ── test 1: offline (empty findings) ─────────────────────────────────────────

const goal = "sulfide solid-state battery electrolytes";

const filesBefore = await countSessionFiles();
const offlineCritique = await critiqueFindings(goal, []);
const filesAfter = await countSessionFiles();

const noDiskWrite = filesAfter === filesBefore;
const hasNextQuery = offlineCritique.nextQueries.length >= 1;
const allStrings = offlineCritique.nextQueries.every(
  (q) => typeof q === "string" && q.trim().length > 0,
);

// ── test 2: with a small set of stub findings ─────────────────────────────────

const stubFindings: Finding[] = [
  {
    id: "find_aa",
    createdAt: new Date().toISOString(),
    agent: "search",
    claim: "Sulfide electrolytes achieve 10 mS/cm ionic conductivity.",
    summary: "High conductivity sulfide electrolytes for all-solid batteries.",
    source: {
      kind: "arxiv",
      title: "High-conductivity Sulfide Electrolytes",
      url: "https://arxiv.org/abs/2401.00001",
      year: 2024,
    },
    confidence: 0.65,
    tags: [],
  },
  {
    id: "find_bb",
    createdAt: new Date().toISOString(),
    agent: "search",
    claim: "Moisture sensitivity limits real-world deployment of sulfide SSBs.",
    summary: "Review of moisture stability challenges in sulfide solid-state batteries.",
    source: {
      kind: "semantic-scholar",
      title: "Moisture Stability in Sulfide SSBs",
      url: "https://www.semanticscholar.org/paper/abc123",
      year: 2023,
    },
    confidence: 0.65,
    tags: [],
  },
];

const withFindingsCritique = await critiqueFindings(goal, stubFindings);
const withFindingsOk =
  withFindingsCritique.nextQueries.length >= 1 &&
  withFindingsCritique.nextQueries.every(
    (q) => typeof q === "string" && q.trim().length > 0,
  ) &&
  withFindingsCritique.nextQueries.length <= 4;

// ── report ────────────────────────────────────────────────────────────────────

console.log(
  JSON.stringify(
    {
      offline: {
        strengths: offlineCritique.strengths,
        weaknesses: offlineCritique.weaknesses,
        missingAngles: offlineCritique.missingAngles,
        nextQueries: offlineCritique.nextQueries,
        hasNextQuery,
        allStrings,
        noDiskWrite,
      },
      withFindings: {
        nextQueries: withFindingsCritique.nextQueries,
        queriesCapped: withFindingsCritique.nextQueries.length <= 4,
        ok: withFindingsOk,
      },
    },
    null,
    2,
  ),
);

const pass = hasNextQuery && allStrings && noDiskWrite && withFindingsOk;
process.exit(pass ? 0 : 1);
