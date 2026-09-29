# Project Anveshan Architecture

Project Anveshan is an open-source **Deep Research OS** designed for long-horizon, autonomous, and sourced academic/technical investigations. It operates on a local-first, free-first architecture that runs smoothly on standard consumer hardware (e.g. MacBook or desktop) while supporting local Ollama models and cloud fallback providers.

---

## Architectural Diagram

```text
                    ┌───────────────────────────┐
                    │   User Control Surfaces   │
                    │  Web UI (M11) · CLI (M12) │
                    │    DSH Skills (M13)       │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │    HTTP REST & SSE API    │
                    │      127.0.0.1:4747       │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
      ┌───────────────────────────────────────────────────────┐
      │              Adaptive Research Engine (M09)            │
      │                  Loop Scheduler & Guards              │
      └───┬──────────────┬───────────────┬────────────────┬───┘
          │              │               │                │
          ▼              ▼               ▼                ▼
   ┌─────────────┐┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │Orchestrator ││Search Agent │ │   Critic    │ │ Synthesizer │
   │    (M05)    ││    (M06)    │ │    (M07)    │ │    (M08)    │
   └─────────────┘└──────┬──────┘ └─────────────┘ └─────────────┘
                         │
                         ▼
        ┌───────────────────────────────────┐
        │       Multi-Source Manager        │
        │ arXiv · Semantic Scholar · Brave  │
        └───────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │                    Shared Subsystems                     │
   │  Session Store (M04)          LLM Multi-Provider Router  │
   │  data/sessions/<id>/*.json    Ollama · Gemini · Groq     │
   └──────────────────────────────────────────────────────────┘
```

---

## Core System Layers

### 1. Control Surfaces
- **Web UI (`web/`)**: A fast, zero-bloat React + Vite dashboard displaying real-time agent events via Server-Sent Events (SSE), source cards, and a report download trigger.
- **CLI (`src/cli.ts`)**: Headless terminal runner (`npm run research -- "<goal>"`) supporting interactive event streaming, `--rounds`, `--resume`, and graceful SIGINT pauses (exit code 130).
- **DeepSeek Harness Skills (`.dsh/skills/`)**: Five standardized DSH skills enabling agentic workflows inside DeepSeek Harness workspaces.

### 2. Control & Event API (`src/server/`)
- Express 5 server bound strictly to `127.0.0.1:4747`.
- Non-blocking session orchestration: `POST /api/sessions/:id/start` kicks off background research immediately.
- Live telemetry: `GET /api/sessions/:id/events` streams live state updates over Server-Sent Events (SSE) with periodic keepalive heartbeats.
- Serves static pre-built React assets from `web/dist`.

### 3. Adaptive Research Loop (`src/engine/loop.ts`)
The OS scheduler that drives the iterative multi-round pipeline:
- **Round Cycle**: Plan → Parallel Bounded Search → Batched Claim Extraction → Dedup → Contradiction Detection → Critique → Gap Detection → Convergence Check.
- **State Preservation**: Saves progress after every phase; runs are fully pausable and resumable.
- **Concurrency Guard**: Strict in-memory mutex prevents simultaneous duplicate runs on the same session ID.

### 4. Specialized Agents (`src/engine/agents/`)
- **Orchestrator (`orchestrator.ts`)**: Formulates an initial or follow-up `ResearchPlan` composed of focused `ResearchTask` queries. Uses fast-path planning when previous rounds indicate narrow gaps.
- **Search Manager (`src/engine/search/`)**: Concurrently executes search tasks across arXiv, Semantic Scholar, CrossRef, and web search engines with rate-limiting, deduplication, and snippet normalization.
- **Evidence Extractor (`evidence.ts`)**: Extracts atomic, falsifiable claims from raw findings with batching (up to 8 sources per LLM prompt).
- **Critic & Gap Detector (`critic.ts`, `gapDetector.ts`)**: Dissects evidence for weaknesses, unverified assumptions, and logical contradictions, issuing prioritized follow-up queries.
- **Synthesizer (`synthesizer.ts`)**: Compiles all verified findings, claims, and citations into an extensive, structured Markdown research report with numerical source references.

### 5. Multi-Provider LLM Router (`src/engine/llm.ts`)
- Tiered cascade: Priority cloud providers (Gemini, Groq, OpenRouter) → Local Ollama fallback.
- Rate-limit and quota management with exponential backoff and transparent rollover.
- Offline resilience: If all models are unreachable or unconfigured, agents switch to deterministic rule-based algorithms to guarantee completion without unhandled crashes.

### 6. Session Disk Memory (`src/engine/store.ts`)
Every session is an isolated on-disk folder under `data/sessions/<session-id>/`:
```text
data/sessions/<session-id>/
├── meta.json         # Session status, timestamps, model info, performance metrics
├── plan.json         # Latest structured research plan and task states
├── findings.json     # All discovered sources with full URL provenance and snippets
├── claims.json       # Extracted atomic claims, scores, and cluster references
├── critiques.json    # Round-by-round critique evaluations and identified gaps
├── events.json       # Append-only chronological audit log (capped at 500 events)
└── report.md         # Final compiled, cited markdown report
```

---

## End-to-End Data Flow

```text
1. User supplies research goal
       │
2. Orchestrator builds ResearchPlan (queries + rationale)
       │
3. Search Manager queries arXiv, Semantic Scholar, and Web APIs
       │
4. Quality Scorer & Evidence Extractor produce verified Claims
       │
5. Lexical & Semantic Deduplicator clusters duplicate claims
       │
6. Critic & Gap Detector evaluate evidence sufficiency
       │
   ┌───┴────────────────────────────────────────┐
   ▼                                            ▼
Gaps remain & rounds < maxRounds       Evidence sufficient / max reached
   │                                            │
Return to Step 2 with targeted queries         Synthesizer formats report.md
                                                │
                                       Session marked "completed"
```
