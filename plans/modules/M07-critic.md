# M07 — Critic agent

**Status:** Not started  
**Goal:** Read current findings and return gaps, weak claims, and follow-up queries.  
**Depends on:** M02, M04  
**Unblocks:** M09

## Why this module exists

Long-horizon research is a loop of **search → criticize → replan**. Without a critic, the system stops at a pile of links.

## What to build

### Files

| Path | Role |
|---|---|
| `src/engine/agents/critic.ts` | `critiqueFindings(goal, findings, signal) → Critique` |

### Behavior

LLM JSON with keys matching `Critique` (`strengths`, `weaknesses`, `missingAngles`, `nextQueries`).

Offline fallback:

- strengths: count of sources + mix of kinds
- weaknesses: “web results lack abstracts”, “few recent years”, etc. based on simple stats (year spread, kind mix)
- missingAngles: always include “conflicting results” and “limitations / failure modes”
- nextQueries: `{goal} limitations`, `{goal} comparison`, plus any year that is missing

Cap `nextQueries` at 4.

## Acceptance checks

- [ ] Offline: still returns a `Critique` with at least one `nextQueries` item.
- [ ] `nextQueries` are non-empty strings.
- [ ] Function does not write to disk (M09 / store does that).

## Done means

The orchestrator’s next round can take `critique.nextQueries` as `extraQueries`.

## Deferred

Scoring individual findings, fact-checking against full text, debate between two critic personas.
