# M08 — Synthesizer agent

**Status:** Done  
**Goal:** Write a multi-section Markdown report with citations from stored findings only.  
**Depends on:** M02, M04  
**Unblocks:** M09

## Why this module exists

The user-visible product of Anveshan is a **sourced report**, not a chat transcript.

## What to build

### Files

| Path | Role |
|---|---|
| `src/engine/agents/synthesizer.ts` | `writeReport(goal, plan, findings, critiques, signal) → string` |
| `src/engine/report.ts` | Pure helpers: citation list, offline template |

Split is optional; if one file stays small, keep helpers in `synthesizer.ts`.

### Report structure (required headings)

```markdown
# {goal}

## Executive summary
## What we searched
## Findings
## Conflicts and weak points
## Open questions
## Sources
```

### Citation rule

Every finding used in Findings must appear in Sources as:

`[n] Title — URL (kind, year if any)`

The synthesizer **must not** cite URLs that are not in `findings`.

### LLM vs offline

- Online: ask the model to write the sections, and pass a numbered source table so it can cite `[n]`.
- Offline: fill the template with bullet claims + the same source table. Still a valid multi-section report.

## Acceptance checks

- [x] Offline report contains `## Sources` and at least as many listed URLs as findings.
- [x] No hallucinated `https://` links that were not in findings (spot-check: parse URLs from report ⊆ finding URLs).
- [x] Report is Markdown, UTF-8.

## Done means

M09 can `saveReport` and M11 can offer a download.

## Deferred

PDF export, confidence badges in the UI, bibliography styles (APA/IEEE).
