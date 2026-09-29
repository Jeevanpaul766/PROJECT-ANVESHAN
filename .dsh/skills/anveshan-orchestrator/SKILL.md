---
name: anveshan-orchestrator
description: >
  Guides an agent through the Anveshan Orchestrator — the component that
  translates a research goal into a structured ResearchPlan with search tasks.
  Use when modifying planning logic, gap-driven query generation, or the
  research round strategy.
---

# Anveshan Orchestrator Skill

## Role

The orchestrator converts a plain-text research goal into a `ResearchPlan`
containing ordered `ResearchTask` objects that the search agent executes.

**Phase 2 enhancements:**
- Accepts `ResearchGap[]` from the gap detector — gap queries are prioritized.
- Query limit is configurable via `ANVESHAN_MAX_QUERIES_PER_ROUND` (default 8).

## Location

```
src/engine/agents/orchestrator.ts
```

## Public API

```typescript
async function buildPlan(
  goal: string,
  priorFindings: Finding[],
  extraQueries: string[],
  signal?: AbortSignal,
  model?: string,
  gaps?: ResearchGap[],     // Phase 2: gaps from previous round
): Promise<ResearchPlan>
```

## Fallback Behaviour

If the LLM is unavailable or returns malformed JSON, `buildPlan` returns a
**heuristic fallback plan** built from:

```typescript
[
  goal,
  `${goal} review 2023 2024 2025 2026`,
  `${goal} open problems limitations`,
  `${goal} survey`,
  ...gapQueries,   // from previous gap detection
  ...extraQueries, // from previous critic
]
```

The orchestrator never throws. It degrades gracefully.

## Query Limit

`maxQueriesPerRound` is read from `loopConfig()`:
- Default: `8`
- Override: `ANVESHAN_MAX_QUERIES_PER_ROUND=N`

Tasks beyond this limit are silently truncated in `toTasks()`.

## Gap Integration

When `gaps` is passed:
1. Gaps are sorted by `importance` (descending).
2. `suggestedQuery` from each gap is injected **before** generic queries.
3. This ensures the most important research gaps are addressed in the next round.

## Extending

To add a new planning capability (e.g., date-range filtering):
1. Modify the system prompt in `buildPlan`.
2. Extend `PlanJson` to capture the new field.
3. Map it to `ResearchTask` in `toTasks()`.

Do **not** add LLM calls outside of `buildPlan` — keep it a single round-trip.
