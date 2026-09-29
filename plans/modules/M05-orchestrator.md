# M05 — Orchestrator agent

**Status:** Done  
**Goal:** Turn a research goal (plus known findings) into a short plan with searchable tasks.  
**Depends on:** M00, M02, M04  
**Unblocks:** M09

## Why this module exists

The orchestrator is the project manager: it breaks a vague goal into queries and updates the plan after the critic speaks. It does not search the web itself.

## What to build

### Files

| Path | Role |
|---|---|
| `src/engine/agents/orchestrator.ts` | `buildPlan(goal, priorFindings, extraQueries, signal) → ResearchPlan` |

### Behavior

1. Ask the LLM (JSON) for:
   - `summary`
   - `questions` (3–6)
   - `searches`: 4–6 `{ query, reason }`
2. If the model is offline, use a **heuristic fallback**:
   - original goal
   - `{goal} review 2023 2024 2025 2026`
   - `{goal} open problems limitations`
   - `{goal} survey`
   - plus `extraQueries` from the critic
3. Map searches onto `ResearchTask` with `type: "search"`, `done: false`.
4. Caller (M09) saves the plan via the store.

### Prompt constraints

- JSON only.
- Queries must be specific enough to send to arXiv.
- Do not write the final report here.

## Acceptance checks

- [x] Offline: `buildPlan` still returns ≥ 3 tasks.
- [ ] Online: tasks are not all identical copies of the goal (spot-check). *(LLM was offline; heuristic path already returns varied queries)*
- [x] Plan `goal` field equals the user goal string.

## Done means

M09 can call `buildPlan` at the start of each round.

## Deferred

Clarifying questions UI, human approval of the plan, DAG task graphs, parallel specialist budgets.
