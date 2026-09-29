---
name: anveshan-synthesizer
description: >
  Guides an agent through Anveshan's Synthesizer — the component that converts
  research findings + claims + citations into a structured Markdown report.
  Use when modifying report structure, citation logic, or hallucination guards.
---

# Anveshan Synthesizer Skill

## Role

Converts all research artifacts (findings, claims, critiques, contradictions)
into a structured Markdown research report with precise, traceable citations.

**Phase 2 change**: the synthesizer now uses a `CitationMap` built from
`Claim → Finding → URL → [n]` chains. It never guesses source-claim mappings.

## Location

```
src/engine/agents/synthesizer.ts
src/engine/citations.ts         ← builds the CitationMap
src/engine/dedup.ts             ← dedupedRoots() for unique claims
```

## Public API

```typescript
async function writeReport(
  goal: string,
  plan: ResearchPlan | null,
  findings: Finding[],
  critiques: Critique[],
  signal?: AbortSignal,
  model?: string,
  claims?: Claim[],             // Phase 2: atomic claims for citation
  contradictions?: Contradiction[], // Phase 2: detected contradictions
): Promise<string>
```

Returns a Markdown string. Never throws. Falls back to a structural template
if the LLM is unavailable.

## Report Structure

Every report has exactly these H2 sections:

```markdown
# Research Goal

## Executive summary
## What we searched
## Findings
## Conflicts and weak points
## Open questions
## Sources
```

## Citation Contract

1. `buildCitationMap(claims, findings)` assigns `[1], [2], …` to unique URLs.
2. The source table is passed to the LLM — it MUST only use those indices.
3. `stripHallucinatedLinks()` strips any `[text](https://...)` link where the
   URL is not in the allowed set.

### Backward compat (no claims)
If `claims` is empty (old session), `buildCitationMapFromFindings()` is used
to build citations directly from findings.

## Offline Report (Fallback)

When the LLM is unavailable:
- Claim statements replace finding.claim with inline `[n]` refs.
- Contradiction section is populated from `contradictions[]`.
- `renderCitationSection()` generates the numbered source list.

## Extending

- To change section order: edit `offlineReport()` and the LLM prompt jointly.
- To add a new section: add it to both the fallback template and the LLM prompt.
- Do **not** add inline `[text](url)` links in the fallback template — use `[n]` refs only.

## Debugging Hallucinated Links

If the report contains broken links, check `stripHallucinatedLinks()`:
```typescript
const allowed = new Set([...citationMap.indexByUrl.keys()]);
// The function strips any markdown link whose href is not in `allowed`.
```
