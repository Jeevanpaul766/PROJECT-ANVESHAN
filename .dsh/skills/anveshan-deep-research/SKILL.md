---
name: anveshan-deep-research
description: >
  Master reference for Project Anveshan's complete Phase 2 research pipeline.
  Use this skill when: running an end-to-end research session, debugging the
  adaptive loop, understanding the data flow, or extending the system.
---

# Anveshan Deep Research Skill

## Phase 2 Pipeline

```
USER QUERY
    │
    ▼
ORCHESTRATOR          buildPlan() — goal → ResearchPlan
    │                 Accepts gaps[] from previous round
    ▼
SEARCH MANAGER        runSearchTasks() — tasks → Sources[]
  ┌─────────────┬────────────────┐
arXiv        S2              Brave
  └─────────────┴────────────────┘
    │
    ▼
EVIDENCE EXTRACTOR    extractClaims() — Finding → Claim[] (FAST model)
    │
    ▼
SOURCE QUALITY        scoreSource()   — Source → SourceScore (no LLM)
    │
    ▼
DEDUPLICATION         deduplicateClaims() — Jaccard/lexical similarity
    │
    ▼
CONTRADICTION CHECK   detectContradictions() — Claim[] → Contradiction[] (SMART model)
    │
    ▼
CRITIC                critiqueFindings() — quality/gap analysis (SMART model)
    │
    ▼
GAP DETECTOR          detectGaps() — identifies missing coverage (SMART model)
    │
    ├── gaps + not sufficient → back to ORCHESTRATOR (next round)
    │
    └── sufficient OR maxRounds reached
              │
              ▼
         CITATIONS        buildCitationMap() — Claim → Citation[]
              │
              ▼
         SYNTHESIZER       writeReport() — Markdown with [n] refs (SMART model)
              │
              ▼
         FINAL REPORT
```

## Key Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANVESHAN_LLM_MODEL` | `qwen2.5:7b` | Default model |
| `ANVESHAN_FAST_MODEL` | (same as default) | Extraction tasks |
| `ANVESHAN_SMART_MODEL` | (same as default) | Reasoning tasks |
| `ANVESHAN_BRAVE_API_KEY` | empty | Enable Brave Search |
| `ANVESHAN_MAX_ROUNDS` | `5` | Loop iteration limit |
| `ANVESHAN_MAX_QUERIES_PER_ROUND` | `8` | Queries per round |
| `ANVESHAN_MAX_SOURCES` | `100` | Total source cap |
| `ANVESHAN_MAX_FINDINGS` | `100` | Finding cap |

## OpenRouter Setup (DeepSeek V4)

```env
ANVESHAN_LLM_BASE_URL=https://openrouter.ai/api/v1
ANVESHAN_LLM_API_KEY=sk-or-v1-...
ANVESHAN_LLM_MODEL=deepseek/deepseek-chat-v3-0324
ANVESHAN_FAST_MODEL=deepseek/deepseek-chat-v3-0324
ANVESHAN_SMART_MODEL=deepseek/deepseek-r1
ANVESHAN_BRAVE_API_KEY=BSA...
```

## Session Data Layout

```
data/sessions/<sessionId>/
├── meta.json        — SessionMeta (status, roundsCompleted, metrics)
├── plan.json        — ResearchPlan (current round)
├── findings.json    — Finding[] (all collected sources)
├── claims.json      — Claim[] (Phase 2: LLM-extracted atomic facts)
├── critiques.json   — Critique[] (all rounds)
├── events.json      — SessionEvent[] (capped at 500)
└── report.md        — Final Markdown report
```

## Key Data Flows

### Claims
`Claim.sourceId` → `Finding.id` → `Finding.source.url`

This chain is what `citations.ts` uses to build `[n]` references.  
Never break this chain by creating claims without a valid sourceId.

### Contradictions
`Contradiction.claimAId` + `claimBId` both reference `Claim.id` values from
the same session. Passed to `writeReport()` for the conflict section.

### Gaps
`ResearchGap.suggestedQuery` is injected into the next round's `buildPlan()`
call. This is the adaptive loop's core feedback mechanism.

## Debugging a Failing Session

```typescript
import { loadSnapshot } from "./engine/store.js";

const snap = await loadSnapshot("sess-...");
console.log(snap.meta.status);   // What went wrong?
console.log(snap.events.slice(-5)); // Last 5 events
console.log(snap.claims.length); // How many claims extracted?
```

## Extending the Pipeline

To add a new stage (e.g., citation graph analysis):
1. Create `src/engine/agents/myStage.ts`.
2. Import and call it in `src/engine/loop.ts` at the right point.
3. Persist results via `store.ts` (add a new save/load pair).
4. Update `SessionSnapshot` with optional new field.
5. Add a DSH skill in `.dsh/skills/`.

Do not add new npm dependencies without updating the module plan.
