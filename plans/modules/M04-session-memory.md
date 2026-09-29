# M04 — Session memory and provenance

**Status:** Done  
**Goal:** Persist a research session on disk so work can pause, resume, and show sources later.  
**Depends on:** M00, M01  
**Unblocks:** M05–M09, M10, M12

## Why this module exists

The product’s difference vs chatbots is **memory with provenance**. If findings live only in RAM, long-horizon research is fake.

Storage for MVP: **plain JSON files per session**. No SQLite, no Onyx yet.

## What to build

### Files

| Path | Role |
|---|---|
| `src/engine/store.ts` | Create, load, list, append |

### On-disk layout

```
data/sessions/<sessionId>/
  meta.json
  plan.json
  findings.json
  critiques.json
  events.json
  report.md
```

`DATA_DIR` comes from config (`<repo>/data/sessions`).

### Functions

- `createSession(goal) → SessionMeta` — status `queued`, empty arrays, empty report
- `loadSnapshot(sessionId) → SessionSnapshot`
- `listSessions() → SessionMeta[]` newest first
- `saveMeta`, `setStatus`
- `savePlan`, `saveFindings`, `saveCritiques`, `saveReport`
- `appendEvent(sessionId, eventWithoutTs) → SessionEvent`

Every write updates `meta.updatedAt`.

### Provenance rule

A `Finding` without `source.url` or `source.title` must not be saved. The store should reject or the search agent must not emit it. Prefer rejecting in the agent (M06); store may still assert.

### Resume rule (used by M09)

Resume means: load snapshot, if `status` is `paused` or `failed` or `running` after a crash, set `running` and continue the loop with existing findings/plan. This module only provides load/save; the loop owns the policy.

## Acceptance checks

- [x] Create a session, append two events, save two findings, quit Node, load snapshot: data still there.
- [x] `listSessions` does not throw on an empty `data/sessions` folder.
- [x] Session ids are unique (`id("sess")` from M01).

## Done means

Agents never write files themselves. They call the store.

## Deferred

Onyx knowledge base, encryption, multi-user isolation, zstd session logs like DeepSeek Harness.
