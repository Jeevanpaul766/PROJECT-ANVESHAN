# M00 — Shared types and data contracts

**Status:** Done  
**Goal:** Freeze the nouns the whole system shares so later modules do not invent competing shapes.  
**Depends on:** nothing  
**Unblocks:** every later module

## Why this module exists

Anveshan is a multi-agent system. Orchestrator, search, critic, synthesizer, disk storage, API, and UI all pass the same objects around. If those objects are informal, resume/replay and citations will break.

## What to build

A single TypeScript types file. No runtime behavior. No network. No UI.

### Files

| Path | Role |
|---|---|
| `src/engine/types.ts` | All shared types |
| `plans/contracts/example-session.json` | One fake completed session used as a fixture in later modules |

### Required types

Define at least these (names may match existing draft files; meaning must match this list):

1. `Source` — where a fact came from  
   - `kind`: `"arxiv" | "semantic-scholar" | "web"`  
   - `title`, `url`  
   - optional `authors`, `year`, `venue`, `snippet`
2. `Finding` — one stored claim with provenance  
   - `id`, `createdAt`, `agent`, `claim`, `summary`, `source`, `confidence` (0–1), `tags`
3. `ResearchTask` — one unit of work on the plan  
   - `id`, `type`: `"search" | "read" | "critique" | "synthesize"`  
   - `query`, `reason`, `done`
4. `ResearchPlan` — orchestrator output  
   - `goal`, `summary`, `questions[]`, `tasks[]`, `updatedAt`
5. `Critique` — critic output  
   - `createdAt`, `strengths[]`, `weaknesses[]`, `missingAngles[]`, `nextQueries[]`
6. `SessionEvent` — live log row  
   - `ts`, `type`, `agent`, `message`, optional `data`
7. `SessionMeta` — list/header record  
   - `id`, `goal`, `status`, timestamps, `model`, `roundsCompleted`, `findingCount`, optional `error`
8. `SessionSnapshot` — full session for resume and UI  
   - `meta`, `plan`, `findings`, `critiques`, `events`, `reportMarkdown`
9. `LoopConfig` — `maxRounds`, `maxFindings`, `model`

`status` values: `queued | running | paused | completed | failed | cancelled`

`agent` values: `orchestrator | search | critic | synthesizer | system`

## Rules

- Do not add database libraries here.
- Do not add Zod unless a later module truly needs runtime validation; if you add it, keep schemas in this module and export both types and parsers.
- IDs are strings. Timestamps are ISO-8601 strings.

## Acceptance checks

- [x] `src/engine/types.ts` compiles.
- [x] Example JSON in `plans/contracts/example-session.json` can be described entirely with those types (no extra mystery fields that code will depend on).
- [x] A short comment at the top of `types.ts` points back to this plan file.

## Done means

Any new file that stores or returns research state imports from `types.ts` instead of declaring its own `Finding` / `Source`.

## Deferred

UI view-models, HTTP DTO wrappers, DeepSeek Harness plugin types.
