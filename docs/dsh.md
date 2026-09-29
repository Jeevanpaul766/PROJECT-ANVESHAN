# Using Anveshan with DeepSeek Harness

Anveshan ships five DSH skills that let the DeepSeek Harness agent run deep research sessions — either through the built-in CLI or fully manually with its own tools.

## Prerequisites

- Node.js ≥ 20 (for the CLI path)
- This repository cloned locally
- DeepSeek Harness (`dsh`) installed — see [dsh docs](https://github.com/deepseek-ai/dsh)

Anveshan works **without** dsh. See the [README](../README.md) for the standalone CLI and web UI.

---

## Open this repo as a dsh workspace

```bash
# From the repo root
dsh open .
```

Harness will discover the skills in `.dsh/skills/` automatically. You should see them listed in the skill catalog:

- `anveshan-deep-research` ← start here
- `anveshan-orchestrator`
- `anveshan-search`
- `anveshan-critic`
- `anveshan-synthesizer`

---

## Running a research job via dsh

The harness agent reads the skill instructions and will use the CLI when Node.js is available:

```
You: Research the state of solid-state battery electrolytes in 2024.
```

The agent will call:
```bash
npm run research -- "state of solid-state battery electrolytes 2024"
```

And stream the results back into the conversation.

---

## Resuming a paused session

If a run was interrupted:

```
You: Resume session sess_abc123
```

The agent will call:
```bash
npm run research -- --resume sess_abc123
```

---

## Manual mode (no Node.js)

If the harness agent cannot execute shell commands, it follows the manual fallback procedures documented in each skill:

1. Plans queries using `anveshan-orchestrator`
2. Searches sources using `anveshan-search` (calls arXiv, Semantic Scholar, DuckDuckGo directly)
3. Critiques with `anveshan-critic`
4. Writes the report with `anveshan-synthesizer` and saves it to `data/sessions/<id>/report.md`

All file paths and JSON schemas match exactly what the standalone engine writes, so sessions started manually can be resumed by the CLI and vice versa.

---

## Environment variables

Set these before running `dsh open .` to configure the research engine:

| Variable | Default | Description |
|---|---|---|
| `ANVESHAN_LLM_BASE_URL` | `http://127.0.0.1:11434/v1` | OpenAI-compatible API base URL |
| `ANVESHAN_LLM_API_KEY` | `ollama` | API key (use `ollama` for local Ollama) |
| `ANVESHAN_LLM_MODEL` | `qwen2.5:7b` | Model name |
| `ANVESHAN_MAX_ROUNDS` | `3` | Max planning rounds per session |
| `ANVESHAN_MAX_FINDINGS` | `24` | Max findings to collect |

Copy `.env.example` to `.env` and fill in your values.

---

## Skill directory layout

```
.dsh/
  skills/
    anveshan-deep-research/   ← master skill
      SKILL.md
    anveshan-orchestrator/
      SKILL.md
    anveshan-search/
      SKILL.md
    anveshan-critic/
      SKILL.md
    anveshan-synthesizer/
      SKILL.md
```

Harness also checks `.agents/skills/` — you can symlink or copy these there if your workspace uses that layout.

---

## Session file layout

Every session is stored as plain JSON + Markdown:

```
data/sessions/<session-id>/
  meta.json        ← status, goal, roundsCompleted, findingCount
  plan.json        ← current ResearchPlan
  findings.json    ← Finding[] with source provenance
  critiques.json   ← Critique[] per round
  events.json      ← SessionEvent[] (full audit trail)
  report.md        ← final cited Markdown report
```

These files can be read and written by both the harness agent and the standalone engine interchangeably.
