/**
 * HTTP API route handlers for Project Anveshan.
 * Spec: plans/modules/M10-http-api.md
 */

import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import { VERSION } from "./index.js";
import { getAvailableModels, probeLlm } from "../engine/llm.js";
import {
  createSession,
  listSessions,
  loadSnapshot,
} from "../engine/store.js";
import { cancelResearch, runResearch } from "../engine/loop.js";
import type { SessionEvent } from "../engine/types.js";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Narrow Express param (string | string[]) to a plain string. */
function param(p: string | string[]): string {
  return Array.isArray(p) ? p[0] : p;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------


// In-memory pub/sub for live events: sessionId → Set of response objects
const sseClients = new Map<string, Set<Response>>();

/** Publish an event to all SSE clients watching this session. */
export function publishEvent(sessionId: string, event: SessionEvent): void {
  const clients = sseClients.get(sessionId);
  if (!clients?.size) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(data);
    } catch {
      // Client disconnected mid-write; remove below
      clients.delete(res);
    }
  }
}

function addSseClient(sessionId: string, res: Response): void {
  if (!sseClients.has(sessionId)) sseClients.set(sessionId, new Set());
  sseClients.get(sessionId)!.add(res);
}

function removeSseClient(sessionId: string, res: Response): void {
  sseClients.get(sessionId)?.delete(res);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function healthHandler(_req: Request, res: Response): Promise<void> {
  const llm = await probeLlm();
  res.json({ ok: true, llm, version: VERSION });
}

async function modelsHandler(_req: Request, res: Response): Promise<void> {
  const models = await getAvailableModels();
  res.json(models);
}

async function listSessionsHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const sessions = await listSessions();
  res.json(sessions);
}

async function createSessionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const goal =
    typeof req.body?.goal === "string" ? req.body.goal.trim() : "";
  const model =
    typeof req.body?.model === "string" ? req.body.model.trim() : undefined;
  if (!goal) {
    res.status(400).json({ error: "body.goal is required" });
    return;
  }
  const meta = await createSession(goal, model);
  res.status(201).json(meta);
}

async function getSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const snap = await loadSnapshot(param(req.params.id));
    res.json(snap);
  } catch {
    res.status(404).json({ error: "Session not found" });
  }
}

async function startSessionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req.params.id);

  // Verify session exists first
  try {
    await loadSnapshot(id);
  } catch {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Fire off in background — do NOT await
  runResearch(id, {
    onEvent: (event) => publishEvent(id, event),
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    publishEvent(id, {
      ts: new Date().toISOString(),
      type: "error",
      agent: "system",
      message: msg,
    });
  });

  res.json({ status: "running", sessionId: id });
}

function pauseSessionHandler(req: Request, res: Response): void {
  cancelResearch(param(req.params.id));
  res.json({ status: "paused", sessionId: param(req.params.id) });
}

async function sseHandler(req: Request, res: Response): Promise<void> {
  const id = param(req.params.id);

  // Verify session exists
  let snap;
  try {
    snap = await loadSnapshot(id);
  } catch {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send all existing events first
  for (const event of snap.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Register for live events
  addSseClient(id, res);

  // Heartbeat every 15 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 15_000);

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(id, res);
  });
}

async function reportHandler(req: Request, res: Response): Promise<void> {
  try {
    const snap = await loadSnapshot(param(req.params.id));
    if (!snap.reportMarkdown) {
      res.status(404).json({ error: "Report not yet available" });
      return;
    }
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(snap.reportMarkdown);
  } catch {
    res.status(404).json({ error: "Session not found" });
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function buildRouter(): RouterType {
  const router = Router();

  router.get("/api/health", (req, res) => void healthHandler(req, res));
  router.get("/api/models", (req, res) => void modelsHandler(req, res));

  router.get("/api/sessions", (req, res) =>
    void listSessionsHandler(req, res),
  );
  router.post("/api/sessions", (req, res) =>
    void createSessionHandler(req, res),
  );
  router.get("/api/sessions/:id", (req, res) =>
    void getSessionHandler(req, res),
  );
  router.post("/api/sessions/:id/start", (req, res) =>
    void startSessionHandler(req, res),
  );
  router.post("/api/sessions/:id/pause", (req, res) =>
    pauseSessionHandler(req, res),
  );
  router.get("/api/sessions/:id/events", (req, res) =>
    void sseHandler(req, res),
  );
  router.get("/api/sessions/:id/report", (req, res) =>
    void reportHandler(req, res),
  );

  return router;
}
