# M06 — Search agent

**Status:** Done  
**Goal:** Execute plan search tasks and append `Finding` records with real sources.  
**Depends on:** M03, M04  
**Unblocks:** M09

## Why this module exists

This agent is the librarian. It must not invent papers. Every claim is grounded in a `Source` from M03.

## What to build

### Files

| Path | Role |
|---|---|
| `src/engine/agents/search.ts` | `runSearchTasks(plan, existing, signal) → Finding[]` |

### Behavior

For each `ResearchTask` with `type === "search"` and `done === false`:

1. `gatherSources(task.query)`
2. For each source, create a `Finding`:
   - `claim`: short factual line from title + snippet (LLM optional; if offline, use title + first 240 chars of snippet)
   - `summary`: snippet or abstract slice
   - `source`: the M03 object
   - `agent`: `"search"`
   - `confidence`: 0.4–0.7 heuristic (academic kinds slightly higher than raw web)
   - `tags`: include task id or query slug
3. Skip sources that duplicate an existing finding URL.
4. Stop when `existing.length + new >= maxFindings` (read from `loopConfig()`).
5. Mark those tasks `done: true` on a **copy** of the plan and return both findings and the updated plan, **or** return findings and let M09 mark tasks done. Pick one and document it in the function comment. Recommended: return `{ findings, plan }`.

### LLM use

Optional one-liner rewrite of the claim. If you add it, it must not run if `usedModel` would be required for the whole agent to function. Offline path is mandatory.

## Acceptance checks

- [x] A live query produces findings whose `source.url` is http(s).
- [x] Running the same task twice does not duplicate URLs.
- [x] No finding has an empty title.

## Done means

The loop can grow a findings list without talking to search APIs directly.

## Deferred

Full-text read of landing pages, citation graph hops, paywalled publisher logic.
