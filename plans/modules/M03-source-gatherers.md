# M03 — Source gatherers

**Status:** Done  
**Goal:** Given a query string, return a de-duplicated list of `Source` objects from academic and web search. No LLM.  
**Depends on:** M00, M01  
**Unblocks:** M06

## Why this module exists

Search is the hands of the research OS. Citations are only as good as this layer. Keep it separate from “what the agent thinks the finding is.”

## What to build

### Files

| Path | Role |
|---|---|
| `src/engine/search.ts` | `searchArxiv`, `searchSemanticScholar`, `searchWeb`, `gatherSources` |

### Providers (all free, no API key required for MVP)

1. **arXiv** — `https://export.arxiv.org/api/query`  
   Atom XML. Parse title, id URL, authors, published year, summary.
2. **Semantic Scholar** — `https://api.semanticscholar.org/graph/v1/paper/search`  
   JSON. Fields: title, url, year, venue, abstract, authors, externalIds.  
   If this endpoint rate-limits, return `[]` for that provider; do not fail the whole gather.
3. **Web** — DuckDuckGo HTML (`https://html.duckduckgo.com/html/`)  
   Parse result titles + destination URLs. Snippets may be empty.

`gatherSources(query, signal)` runs the three in parallel (`Promise.allSettled`), merges, de-dupes by URL or title.

Send a clear `User-Agent`: `ProjectAnveshan/0.1 (research; local-first)`.

Respect `AbortSignal`.

### Rules

- Do not fetch full PDFs in this module.
- Do not scrape behind logins.
- Do not call the LLM.
- Cap each provider (suggested: arXiv 5, S2 5, web 4).

## Acceptance checks

- [x] `gatherSources("solid-state battery sulfide electrolyte")` returns at least one arXiv or Semantic Scholar source when the network is up.
- [x] Duplicate URLs appear once.
- [x] Killing the abort controller stops in-flight fetches without crashing the process.
- [x] One provider failing still returns results from the others.

### Manual probe

A tiny script `src/scripts/probe-search.ts` that prints titles + URLs is allowed. Keep it until M06, then delete or fold into tests.

## Done means

M06 can turn `Source[]` into `Finding[]` without knowing HTTP details.

## Deferred

Page fetch / HTML-to-text reader, PDF parse, OpenAlex, PubMed, site allowlists, caching.
