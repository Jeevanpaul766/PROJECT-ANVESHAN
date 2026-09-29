/**
 * Manual HTTP API probe for M10 acceptance.
 * Spec: plans/modules/M10-http-api.md
 *
 * Spins up the server in-process, hits every endpoint, then exits.
 *
 * Checks:
 *  1. GET /api/health  →  200 { ok: true }
 *  2. POST /api/sessions  →  201 with session id
 *  3. GET /api/sessions/:id  →  200 with snapshot
 *  4. POST /api/sessions/:id/start  →  200 { status: "running" }
 *  5. GET /api/sessions/:id/events (SSE) receives at least a "status" event
 *  6. GET /api/sessions  →  200 array (session appears)
 */

import { createServer } from "node:http";
import { SERVER } from "../engine/config.js";

// ── start server in-process ───────────────────────────────────────────────────
const { default: app } = await import("../server/index.js");

const PORT = SERVER.port;
const BASE = `http://${SERVER.host}:${PORT}`;

// Give the server a moment to bind
await new Promise<void>((resolve) => setTimeout(resolve, 200));

// ── helpers ───────────────────────────────────────────────────────────────────

function label(tag: string, ok: boolean): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${tag}`);
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`);
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("json") ? await res.json() : await res.text();
  return { status: res.status, body };
}

async function post(
  path: string,
  data?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  const body = await res.json();
  return { status: res.status, body };
}

// ── Test 1: health ────────────────────────────────────────────────────────────

console.log("\n=== Test 1: GET /api/health ===");
const health = await get("/api/health");
label("status 200", health.status === 200);
label("ok === true", (health.body as Record<string, unknown>)?.ok === true);
label("has version", typeof (health.body as Record<string, unknown>)?.version === "string");

// ── Test 2: POST /api/sessions (bad body) ─────────────────────────────────────

console.log("\n=== Test 2: POST /api/sessions — validation ===");
const badSession = await post("/api/sessions", {});
label("missing goal → 400", badSession.status === 400);

// ── Test 3: POST /api/sessions (good body) ────────────────────────────────────

console.log("\n=== Test 3: POST /api/sessions ===");
const newSess = await post("/api/sessions", {
  goal: "sulfide solid-state battery electrolytes",
});
const sessId = (newSess.body as Record<string, unknown>)?.id as string;
label("status 201", newSess.status === 201);
label("session id present", typeof sessId === "string" && sessId.startsWith("sess_"));

// ── Test 4: GET /api/sessions/:id ─────────────────────────────────────────────

console.log("\n=== Test 4: GET /api/sessions/:id ===");
const snap = await get(`/api/sessions/${sessId}`);
label("status 200", snap.status === 200);
label("has meta", typeof (snap.body as Record<string, unknown>)?.meta === "object");
label("has findings array", Array.isArray((snap.body as Record<string, unknown>)?.findings));

// ── Test 5: GET /api/sessions (list) ──────────────────────────────────────────

console.log("\n=== Test 5: GET /api/sessions ===");
const list = await get("/api/sessions");
label("status 200", list.status === 200);
label("is array", Array.isArray(list.body));
label(
  "new session appears in list",
  (list.body as Record<string, unknown>[]).some((s) => s.id === sessId),
);

// ── Test 6: POST /api/sessions/:id/start ──────────────────────────────────────

console.log("\n=== Test 6: POST /api/sessions/:id/start ===");
const start = await post(`/api/sessions/${sessId}/start`);
label("status 200", start.status === 200);
label(
  "status = running",
  (start.body as Record<string, unknown>)?.status === "running",
);

// ── Test 7: SSE receives a status event ───────────────────────────────────────

console.log("\n=== Test 7: SSE events stream ===");

const sseEventReceived = await new Promise<boolean>((resolve) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    resolve(false);
  }, 8000);

  fetch(`${BASE}/api/sessions/${sessId}/events`, {
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('"type":"status"') || buffer.includes('"type":"finding"')) {
          clearTimeout(timeout);
          controller.abort();
          resolve(true);
          return;
        }
      }
      resolve(false);
    })
    .catch(() => resolve(false));
});

label("SSE received event", sseEventReceived);

// ── Test 8: POST pause ────────────────────────────────────────────────────────

console.log("\n=== Test 8: POST /api/sessions/:id/pause ===");
const pause = await post(`/api/sessions/${sessId}/pause`);
label("status 200", pause.status === 200);
label(
  "status = paused",
  (pause.body as Record<string, unknown>)?.status === "paused",
);

// ── Test 9: 404 for unknown route ─────────────────────────────────────────────

console.log("\n=== Test 9: 404 catch-all ===");
const notFound = await get("/api/does-not-exist");
label("status 404", notFound.status === 404);

// ── Summary ───────────────────────────────────────────────────────────────────

const pass =
  health.status === 200 &&
  (health.body as Record<string, unknown>)?.ok === true &&
  newSess.status === 201 &&
  typeof sessId === "string" &&
  snap.status === 200 &&
  Array.isArray(list.body) &&
  start.status === 200 &&
  sseEventReceived;

console.log("\n=== Summary ===");
console.log(JSON.stringify({ pass, sessId }, null, 2));

process.exit(pass ? 0 : 1);
