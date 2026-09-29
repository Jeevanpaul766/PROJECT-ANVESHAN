# M01 — Foundation

**Status:** Done  
**Goal:** A runnable Node + TypeScript repo with env, folders, and scripts, and nothing else required to “work.”  
**Depends on:** M00  
**Unblocks:** M02–M04

## Why this module exists

The product is local-first and free-first. Setup must be boring and repeatable on a MacBook before any agent logic exists.

## What to build

### Files

| Path | Role |
|---|---|
| `package.json` | Scripts only: `dev`, `dev:api`, `dev:web`, `start`, `research`, `typecheck` |
| `tsconfig.json` | Strict ESM TypeScript |
| `.gitignore` | `node_modules`, `dist`, `data/sessions`, `.env` |
| `.env.example` | LLM + server knobs (no secrets) |
| `.env` | Local copy (gitignored). Create by copying the example |
| `src/engine/config.ts` | Reads env; exports `ROOT_DIR`, `DATA_DIR`, `LLM`, `SERVER`, `loopConfig()` |
| `src/engine/ids.ts` | `id(prefix)`, `nowIso()` |
| `README.md` | Placeholder: “See `plans/BUILD.md`. Do not skip modules.” |

### Env keys (freeze these names)

```
ANVESHAN_HOST=127.0.0.1
ANVESHAN_PORT=4747
ANVESHAN_LLM_BASE_URL=http://127.0.0.1:11434/v1
ANVESHAN_LLM_API_KEY=ollama
ANVESHAN_LLM_MODEL=qwen2.5:7b
ANVESHAN_MAX_ROUNDS=3
ANVESHAN_MAX_FINDINGS=24
```

Default model is **local Ollama**. Cloud DeepSeek / Qwen comes later by changing env, not by rewriting code.

### Folder layout to create (empty is fine)

```
src/engine/
src/engine/agents/
src/server/
src/cli.ts          (empty stub ok until M12)
web/                (empty until M11)
data/sessions/      (gitignored; keep a .gitkeep if you want the folder)
plans/              (this planning tree)
```

### Dependencies to add in this module only

- `typescript`, `tsx`, `dotenv`
- `@types/node`
- Do **not** add Express, React, or search libraries yet.

## Existing scaffold

These files were started in an earlier pass: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/engine/config.ts`, `src/engine/ids.ts`. Align them with this plan. Remove extra scripts or deps that are not listed here.

## Acceptance checks

- [x] `cp .env.example .env` works.
- [x] `npx tsc --noEmit` passes with M00 types + config + ids only.
- [x] `config.ts` has no network calls.
- [x] README points to `plans/BUILD.md`.

## Done means

A new clone can typecheck the foundation without Ollama, without an API key, and without a UI.

## Deferred

Vite, Express, concurrently, React, LLM HTTP client.
