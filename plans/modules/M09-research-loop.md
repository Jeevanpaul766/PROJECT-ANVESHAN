# M09 — Research loop

**Status:** Not started  
**Goal:** One function that runs the long-horizon cycle and can be cancelled or resumed.  
**Depends on:** M05, M06, M07, M08  
**Unblocks:** M10, M12, M13

## Why this module exists

This is the OS scheduler: plan → search → remember → criticize → replan → synthesize. Agents stay ignorant of the full cycle.

## What to build

### Files

| Path | Role |
|---|---|
| `src/engine/loop.ts` | `runResearch(sessionId, options)` |
| `src/engine/runtime.ts` | In-memory map of AbortControllers for cancel (tiny) |

### `runResearch` algorithm

```
load snapshot (create session first if caller only passed a goal — prefer caller creates)
setStatus running
emit status event
round = meta.roundsCompleted
while round < maxRounds AND findings.length < maxFindings AND not aborted:
  extraQueries = last critique nextQueries or []
  plan = buildPlan(goal, findings, extraQueries)
  savePlan; emit plan
  { findingsDelta, plan } = runSearchTasks(...)
  merge findings; saveFindings; emit finding events
  critique = critiqueFindings(...)
  saveCritiques; emit critic
  round++; meta.roundsCompleted = round; saveMeta
report = writeReport(...)
saveReport; emit synthesize
setStatus completed
```

On abort: `setStatus("cancelled")` or `"paused"` if you distinguish pause vs cancel. Product asks for **resume**; use:

- `paused` when the user stops a run intending to continue
- `cancelled` when they discard (optional; can wait for UI)

On throw: `setStatus("failed", message)`, rethrow or return.

### Events

Every notable step calls `appendEvent` **and** notifies listeners (EventEmitter or callback `onEvent`). M10 will SSE those live events.

### Concurrency

Only one run per `sessionId`. A second `runResearch` on the same id should throw until the first finishes.

### Time target (product)

The loop should be able to sit in this while-cycle for 30–60 minutes when `maxRounds` / model latency allow it. For development, `ANVESHAN_MAX_ROUNDS=1` is fine. Do not add sleeps to fake duration.

## Acceptance checks

- [ ] `maxRounds=1` produces a report file and status `completed`.
- [ ] Abort mid-search leaves a snapshot that `loadSnapshot` can read.
- [ ] Resume: start a session, pause after round 1, call `runResearch` again, rounds continue from `roundsCompleted` (do not wipe findings).

## Done means

CLI and API are thin wrappers around `runResearch` + store.

## Deferred

Multi-session parallel runs, Experiment agent / sandbox, OpenCode integration.
