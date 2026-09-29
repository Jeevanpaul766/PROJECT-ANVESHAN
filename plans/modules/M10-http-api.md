# M10 — HTTP API

**Status:** Not started  
**Goal:** Local HTTP API so a UI (and later other tools) can start research and watch progress.  
**Depends on:** M09  
**Unblocks:** M11

## Why this module exists

The harness-style product needs a control surface. Keep it local (`127.0.0.1`) by default.

## What to build

### Files

| Path | Role |
|---|---|
| `src/server/index.ts` | Listen using `SERVER.host` / `SERVER.port` |
| `src/server/routes.ts` | Handlers |

### Dependencies (add now)

- `express`, `cors`, `@types/express`, `@types/cors`
- `concurrently` only when M11 lands; not required for API-only

### Routes

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/health` | `{ ok, llm: probeLlm(), version }` |
| GET | `/api/sessions` | list metas |
| POST | `/api/sessions` | body `{ goal }` → createSession, 201 |
| GET | `/api/sessions/:id` | full snapshot |
| POST | `/api/sessions/:id/start` | runResearch in background |
| POST | `/api/sessions/:id/pause` | abort controller |
| GET | `/api/sessions/:id/events` | SSE stream of new events |
| GET | `/api/sessions/:id/report` | `text/markdown` of report.md |

POST start must not block the HTTP response until the whole research finishes. Return `{ status: "running" }` immediately.

SSE: send existing events first, then live `appendEvent` notifications. Heartbeat comments every 15s.

### Security (MVP)

- Bind 127.0.0.1 by default.
- No auth.
- Do not add `--host 0.0.0.0` to README as the default.

## Acceptance checks

- [ ] `curl 127.0.0.1:4747/api/health` works with the API process only.
- [ ] Create session → start → GET snapshot eventually has findings or a clear failed error.
- [ ] SSE receives at least a `status` event after start.

## Done means

M11 can be a static frontend talking only to these routes.

## Deferred

WebSocket, auth, HTTPS, hosted multi-tenant API.
