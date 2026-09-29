---
name: anveshan-critic
description: >
  Guides an agent through Anveshan's Critic subsystem — quality analysis,
  weakness identification, contradiction detection, and next-query generation.
  Use when modifying or debugging the critique or contradiction pipeline.
---

# Anveshan Critic Skill

## Role

The critic evaluates current research evidence and produces:
1. A `Critique` — strengths, weaknesses, missing angles, next queries.
2. A `Contradiction[]` — pairs of claims that logically conflict.

Both are first-class structures in Phase 2 and feed directly into the
adaptive loop's decision-making.

## Location

```
src/engine/agents/critic.ts
```

## Public API

```typescript
// Quality analysis
async function critiqueFindings(
  goal: string,
  findings: Finding[],
  signal?: AbortSignal,
  model?: string,
  claims?: Claim[],          // Phase 2: claim quality data
): Promise<Critique>

// Contradiction detection
async function detectContradictions(
  claims: Claim[],
  signal?: AbortSignal,
): Promise<Contradiction[]>
```

## Critique

### LLM path (primary)
Uses `resolveModel("smart")`. Prompt includes:
- Finding count, source kind breakdown, year range.
- Phase 2: claim count, high-confidence/low-confidence split, average relevance.

### Fallback (no LLM)
Deterministic from metadata:
- Year gap detection.
- Source kind imbalance detection.
- Static open-question templates.

Never returns null or throws.

## Contradiction Detection

Uses `resolveModel("smart")`. Samples up to **20 claims** to keep the prompt
manageable. Returns `Contradiction[]` where each entry has:

```typescript
interface Contradiction {
  id: string;
  claimAId: string;
  claimBId: string;
  explanation: string;    // 1-sentence reason
  severity: number;       // 0–1 (1 = direct logical contradiction)
  createdAt: string;
}
```

### When to call it
After deduplication, before the critic (`critiqueFindings`). The loop at
`src/engine/loop.ts` handles this ordering automatically.

### Example contradiction
```
Paper A: "Method X improves performance by 15%"
Paper B: "Method X shows no significant performance improvement"
→ severity: 0.92, explanation: "Papers report conflicting performance outcomes..."
```

Contradictions are:
- Logged as events in the session.
- Passed to `writeReport()` for the "Conflicts and weak points" section.

## Debugging

```typescript
import { detectContradictions } from "./agents/critic.js";

const claims = await loadClaims(sessionId);
const contradictions = await detectContradictions(claims);
console.log(contradictions);
```

## Extending

- To add new critique dimensions: extend the system prompt and `CritiqueJson`.
- To tune contradiction sensitivity: adjust the system prompt's severity guidance.
- Do **not** call the LLM more than once per `critiqueFindings` invocation.
