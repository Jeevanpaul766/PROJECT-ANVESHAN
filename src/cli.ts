#!/usr/bin/env node
/**
 * CLI entry point for Project Anveshan.
 * Spec: plans/modules/M12-cli.md
 *
 * Usage:
 *   npm run research -- "Deep research on solid-state battery materials 2023-2026"
 *   npm run research -- --resume sess_abc123
 *   npm run research -- --rounds 2 "LLM context window scaling laws"
 *
 * Exit codes:
 *   0  — completed
 *   1  — failed / no goal
 *   130 — cancelled via SIGINT (session saved; resume with --resume)
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { DATA_DIR } from "./engine/config.js";
import { createSession, loadSnapshot } from "./engine/store.js";
import { cancelResearch, runResearch } from "./engine/loop.js";
import type { SessionEvent } from "./engine/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// ANSI colour helpers (gracefully degrades if terminal has no colour support)
// ─────────────────────────────────────────────────────────────────────────────

const HAS_COLOUR =
  process.stdout.isTTY && process.env.NO_COLOR === undefined;

const c = {
  reset:  HAS_COLOUR ? "\x1b[0m"  : "",
  bold:   HAS_COLOUR ? "\x1b[1m"  : "",
  dim:    HAS_COLOUR ? "\x1b[2m"  : "",
  cyan:   HAS_COLOUR ? "\x1b[36m" : "",
  yellow: HAS_COLOUR ? "\x1b[33m" : "",
  green:  HAS_COLOUR ? "\x1b[32m" : "",
  red:    HAS_COLOUR ? "\x1b[31m" : "",
  blue:   HAS_COLOUR ? "\x1b[34m" : "",
  magenta:HAS_COLOUR ? "\x1b[35m" : "",
};

const AGENT_COLOURS: Record<string, string> = {
  orchestrator: c.cyan,
  search:       c.blue,
  critic:       c.yellow,
  synthesizer:  c.green,
  system:       c.dim,
};

const TYPE_ICONS: Record<string, string> = {
  status:    "◆",
  plan:      "📋",
  search:    "🔍",
  finding:   "✦",
  critic:    "⚖",
  synthesize:"✍",
  error:     "✖",
};

function agentTag(agent: string): string {
  const colour = AGENT_COLOURS[agent] ?? "";
  return `${colour}${c.bold}[${agent}]${c.reset}`;
}

function typeIcon(type: string): string {
  return TYPE_ICONS[type] ?? "·";
}

function printEvent(ev: SessionEvent): void {
  const icon = typeIcon(ev.type);
  const tag  = agentTag(ev.agent);
  const ts   = new Date(ev.ts).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const tsStr = `${c.dim}${ts}${c.reset}`;
  // Truncate very long messages to 120 chars for terminal readability
  const msg = ev.message.length > 120
    ? ev.message.slice(0, 117) + "…"
    : ev.message;
  process.stdout.write(`${tsStr}  ${icon} ${tag} ${msg}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  goal: string | null;
  resumeId: string | null;
  rounds: number | null;
} {
  const args = argv.slice(2); // strip node + script
  let goal: string | null = null;
  let resumeId: string | null = null;
  let rounds: number | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--resume" && args[i + 1]) {
      resumeId = args[++i];
    } else if (a === "--rounds" && args[i + 1]) {
      const n = Number.parseInt(args[++i], 10);
      if (Number.isFinite(n) && n > 0) rounds = n;
    } else if (!a.startsWith("--")) {
      goal = a;
    }
  }
  return { goal, resumeId, rounds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { goal, resumeId, rounds } = parseArgs(process.argv);

  // ── Print banner ────────────────────────────────────────────────────────
  process.stdout.write(
    `\n${c.bold}${c.cyan}Anveshan${c.reset}${c.dim} — Deep Research OS${c.reset}\n\n`,
  );

  // ── Resolve session ──────────────────────────────────────────────────────
  let sessionId: string;

  if (resumeId) {
    // Validate the session exists on disk
    const snapDir = join(DATA_DIR, resumeId);
    if (!existsSync(snapDir)) {
      process.stderr.write(
        `${c.red}✖ Session not found: ${resumeId}${c.reset}\n`,
      );
      process.exit(1);
    }
    sessionId = resumeId;
    const snap = await loadSnapshot(sessionId);
    process.stdout.write(
      `${c.dim}Resuming session ${c.reset}${c.bold}${sessionId}${c.reset}\n` +
      `${c.dim}Goal: ${snap.meta.goal}${c.reset}\n` +
      `${c.dim}Rounds completed so far: ${snap.meta.roundsCompleted}${c.reset}\n\n`,
    );
  } else if (goal) {
    const meta = await createSession(goal);
    sessionId = meta.id;
    process.stdout.write(
      `${c.dim}Session  ${c.reset}${c.bold}${sessionId}${c.reset}\n` +
      `${c.dim}Goal     ${c.reset}${goal}\n\n`,
    );
  } else {
    process.stderr.write(
      `${c.red}Usage:${c.reset}\n` +
      `  npm run research -- "Your research goal"\n` +
      `  npm run research -- --resume <session-id>\n` +
      `  npm run research -- --rounds 2 "Your goal"\n`,
    );
    process.exit(1);
  }

  // ── SIGINT → pause ──────────────────────────────────────────────────────
  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) return;
    interrupted = true;
    process.stdout.write(
      `\n${c.yellow}⏸  Pausing… (session saved — resume with --resume ${sessionId})${c.reset}\n`,
    );
    cancelResearch(sessionId);
  });

  // ── Run ─────────────────────────────────────────────────────────────────
  const runOptions = {
    ...(rounds !== null ? { maxRounds: rounds } : {}),
    onEvent: printEvent,
  };

  try {
    await runResearch(sessionId, runOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\n${c.red}✖ Research failed: ${msg}${c.reset}\n`);
    process.exit(1);
  }

  // ── Final status ─────────────────────────────────────────────────────────
  const finalSnap = await loadSnapshot(sessionId);
  const { status } = finalSnap.meta;

  if (status === "paused" || status === "cancelled") {
    process.stdout.write(
      `\n${c.yellow}◆ Session ${status}.${c.reset}\n` +
      `  Resume with:  ${c.bold}npm run research -- --resume ${sessionId}${c.reset}\n\n`,
    );
    process.exit(130);
  }

  if (status === "failed") {
    process.stderr.write(
      `\n${c.red}✖ Session failed.${c.reset} ${finalSnap.meta.error ?? ""}\n`,
    );
    process.exit(1);
  }

  // Completed — print report path
  const reportPath = join(DATA_DIR, sessionId, "report.md");
  const hasReport = existsSync(reportPath) && (finalSnap.reportMarkdown?.trim().length ?? 0) > 0;

  process.stdout.write(`\n${c.green}${c.bold}✔ Research complete!${c.reset}\n`);
  process.stdout.write(`  Rounds    : ${finalSnap.meta.roundsCompleted}\n`);
  process.stdout.write(`  Findings  : ${finalSnap.meta.findingCount}\n`);
  if (hasReport) {
    process.stdout.write(
      `  Report    : ${c.bold}${reportPath}${c.reset}\n`,
    );
    // Spot-check: confirm ## Sources is in the report
    const hasSources = (finalSnap.reportMarkdown ?? "").includes("## Sources");
    if (!hasSources) {
      process.stderr.write(
        `${c.yellow}⚠  Report exists but ## Sources section not found.${c.reset}\n`,
      );
    }
  } else {
    process.stdout.write(`  Report    : (not generated)\n`);
  }
  process.stdout.write("\n");
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
