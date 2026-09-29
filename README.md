# Project Anveshan

Open Deep Research OS. Local-first, free-first, built module by module.

**Do not start random features.** The build contract is:

- **[plans/BUILD.md](plans/BUILD.md)** — order, tracker, success bar
- **[plans/modules/](plans/modules/)** — one file per module (M00–M15)

Original specs (read-only):

- `Project_Anveshan_Complete_Product_Document.docx`
- `Project_Anveshan_Detailed_Build_Roadmap.docx`

## Current step

**M00–M06** are done. Next: **[M07 — Critic](plans/modules/M07-critic.md)**.

Probes: `npm run probe:llm` · `npm run probe:search` · `npm run probe:store` · `npm run probe:orchestrator` · `npm run probe:search-agent`

## Stack (planned)

- Node 20+, TypeScript
- Local models via Ollama (OpenAI-compatible API)
- Optional cloud: DeepSeek / Qwen via the same adapter
- DeepSeek Harness skills in M13 (app runs without dsh until then)
