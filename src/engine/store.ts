/**
 * Session memory and provenance on disk.
 * Spec: plans/modules/M04-session-memory.md
 * Phase 2: appendEvent capped at 500, saveClaims/loadClaims added.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR, LLM } from "./config.js";
import { id, nowIso } from "./ids.js";
import type {
  Claim,
  Critique,
  Finding,
  ResearchPlan,
  SessionEvent,
  SessionMeta,
  SessionSnapshot,
  SessionStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of events stored per session to bound event.json growth. */
const MAX_EVENTS = 500;

const eventLocks = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function sessionDir(sessionId: string): string {
  return join(DATA_DIR, sessionId);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function assertFindings(findings: Finding[]): void {
  for (const finding of findings) {
    if (!finding.source?.url || !finding.source?.title) {
      throw new Error(
        `Finding ${finding.id} missing source.url or source.title`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export async function createSession(goal: string, model?: string): Promise<SessionMeta> {
  const meta: SessionMeta = {
    id: id("sess"),
    goal: goal.trim(),
    status: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    model: model || LLM.model,
    roundsCompleted: 0,
    findingCount: 0,
  };
  const dir = sessionDir(meta.id);
  await ensureDir(dir);
  await writeJson(join(dir, "meta.json"), meta);
  await writeJson(join(dir, "plan.json"), null);
  await writeJson(join(dir, "findings.json"), []);
  await writeJson(join(dir, "critiques.json"), []);
  await writeJson(join(dir, "events.json"), []);
  await writeJson(join(dir, "claims.json"), []); // Phase 2
  await writeFile(join(dir, "report.md"), "", "utf8");
  return meta;
}

export async function saveMeta(meta: SessionMeta): Promise<void> {
  meta.updatedAt = nowIso();
  await writeJson(join(sessionDir(meta.id), "meta.json"), meta);
}

export async function setStatus(
  meta: SessionMeta,
  status: SessionStatus,
  error?: string,
): Promise<void> {
  meta.status = status;
  if (error !== undefined) {
    meta.error = error;
  } else if (status !== "failed") {
    delete meta.error;
  }
  await saveMeta(meta);
}

export async function loadSnapshot(sessionId: string): Promise<SessionSnapshot> {
  const dir = sessionDir(sessionId);
  const meta = await readJson<SessionMeta | null>(join(dir, "meta.json"), null);
  if (!meta) throw new Error(`Unknown session ${sessionId}`);
  const report = await readFile(join(dir, "report.md"), "utf8").catch(() => "");
  return {
    meta,
    plan: await readJson<ResearchPlan | null>(join(dir, "plan.json"), null),
    findings: await readJson<Finding[]>(join(dir, "findings.json"), []),
    critiques: await readJson<Critique[]>(join(dir, "critiques.json"), []),
    events: await readJson<SessionEvent[]>(join(dir, "events.json"), []),
    reportMarkdown: report.trim() ? report : null,
    // Phase 2: load claims (undefined for old sessions without claims.json)
    claims: await readJson<Claim[]>(join(dir, "claims.json"), []),
  };
}

export async function listSessions(): Promise<SessionMeta[]> {
  await ensureDir(DATA_DIR);
  const names = await readdir(DATA_DIR).catch(() => [] as string[]);
  const metas: SessionMeta[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const meta = await readJson<SessionMeta | null>(
      join(DATA_DIR, name, "meta.json"),
      null,
    );
    if (meta) metas.push(meta);
  }
  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ---------------------------------------------------------------------------
// Research artifact persistence
// ---------------------------------------------------------------------------

export async function savePlan(
  sessionId: string,
  plan: ResearchPlan,
): Promise<void> {
  const dir = sessionDir(sessionId);
  await writeJson(join(dir, "plan.json"), plan);
  // Touch meta.updatedAt without a full re-read
  const meta = await readJson<SessionMeta | null>(join(dir, "meta.json"), null);
  if (meta) await saveMeta(meta);
}

export async function saveFindings(
  sessionId: string,
  findings: Finding[],
): Promise<void> {
  assertFindings(findings);
  const dir = sessionDir(sessionId);
  await writeJson(join(dir, "findings.json"), findings);
  const meta = await readJson<SessionMeta | null>(join(dir, "meta.json"), null);
  if (meta) {
    meta.findingCount = findings.length;
    await saveMeta(meta);
  }
}

export async function saveCritiques(
  sessionId: string,
  critiques: Critique[],
): Promise<void> {
  const dir = sessionDir(sessionId);
  await writeJson(join(dir, "critiques.json"), critiques);
  const meta = await readJson<SessionMeta | null>(join(dir, "meta.json"), null);
  if (meta) await saveMeta(meta);
}

export async function saveReport(
  sessionId: string,
  markdown: string,
): Promise<void> {
  const dir = sessionDir(sessionId);
  await writeFile(join(dir, "report.md"), markdown, "utf8");
  const meta = await readJson<SessionMeta | null>(join(dir, "meta.json"), null);
  if (meta) await saveMeta(meta);
}

// ---------------------------------------------------------------------------
// Phase 2: Claim persistence
// ---------------------------------------------------------------------------

/**
 * Persist all claims for a session.
 * Creates claims.json if it does not exist (old sessions stay backward compat).
 */
export async function saveClaims(
  sessionId: string,
  claims: Claim[],
): Promise<void> {
  const dir = sessionDir(sessionId);
  await writeJson(join(dir, "claims.json"), claims);
  const meta = await readJson<SessionMeta | null>(join(dir, "meta.json"), null);
  if (meta) {
    meta.claimCount = claims.length;
    await saveMeta(meta);
  }
}

/**
 * Load claims for a session. Returns [] for old sessions without claims.json.
 */
export async function loadClaims(sessionId: string): Promise<Claim[]> {
  return readJson<Claim[]>(join(sessionDir(sessionId), "claims.json"), []);
}

// ---------------------------------------------------------------------------
// Event persistence — capped at MAX_EVENTS to bound file growth
// ---------------------------------------------------------------------------

export async function appendEvent(
  sessionId: string,
  event: Omit<SessionEvent, "ts">,
): Promise<SessionEvent> {
  const dir = sessionDir(sessionId);
  
  const execute = async () => {
    let events = await readJson<SessionEvent[]>(join(dir, "events.json"), []);

    const full: SessionEvent = { ...event, ts: nowIso() };
    events.push(full);

    if (events.length > MAX_EVENTS) {
      events = [events[0], ...events.slice(-(MAX_EVENTS - 1))];
    }

    await writeJson(join(dir, "events.json"), events);
    const meta = await readJson<SessionMeta | null>(join(dir, "meta.json"), null);
    if (meta) await saveMeta(meta);
    return full;
  };

  const prev = eventLocks.get(sessionId) || Promise.resolve();
  const next = prev.then(execute).catch(execute);
  eventLocks.set(sessionId, next.then(() => {}));
  
  return next;
}
