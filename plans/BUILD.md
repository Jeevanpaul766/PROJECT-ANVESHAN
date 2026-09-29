# Project Anveshan — Build Plan Index

Build this product **one module at a time**. Do not start a later module until the previous module’s acceptance checks pass.

Source specs (keep as-is):

- `Project_Anveshan_Complete_Product_Document.docx`
- `Project_Anveshan_Detailed_Build_Roadmap.docx`

This folder is the working build contract for a solo, free-first MVP on a MacBook.

## What we are building

Anveshan is a **Deep Research OS**: a local-first system that takes a research goal, runs specialist agents for a long time, stores every finding with its source, and writes a cited report.

Formula from the product doc:

`Agent = Model + Harness + Skills + Memory + Domain Knowledge`

First version does **not** include: multi-user teams, polished design, many domain packs, paid hosting, or a mobile app.

## How to use these plans

1. Open the next module file in `plans/modules/`.
2. Implement only that module’s file list.
3. Run that module’s verification steps.
4. Check off the module in the tracker below.
5. Only then open the next module.

If something in a later module is tempting, write it in that module’s “Deferred” section instead of coding it now.

## Module order

```text
M00 Contracts
  → M01 Foundation
    → M02 LLM adapter
    → M03 Source gatherers
    → M04 Session memory
        → M05 Orchestrator
        → M06 Search agent   (needs M03 + M04)
        → M07 Critic
        → M08 Synthesizer
            → M09 Research loop
                → M10 HTTP API
                    → M11 Web UI
                → M12 CLI
                → M13 DeepSeek Harness skills
                    → M14 First domain pack (optional after MVP)
                        → M15 Docs, demo, release
```

## Tracker

| ID | Module | Status | Depends on |
|---|---|---|---|
| [M00](modules/M00-contracts.md) | Shared types and data contracts | Done | — |
| [M01](modules/M01-foundation.md) | Repo, env, folders, scripts | Done | M00 |
| [M02](modules/M02-llm-adapter.md) | Ollama / OpenAI-compatible client | Done | M01 |
| [M03](modules/M03-source-gatherers.md) | arXiv, Semantic Scholar, web search | Done | M01 |
| [M04](modules/M04-session-memory.md) | Save/load sessions, findings, provenance | Done | M00, M01 |
| [M05](modules/M05-orchestrator.md) | Plan and next-step agent | Done | M00, M02, M04 |
| [M06](modules/M06-search-agent.md) | Turn queries into sourced findings | Done | M03, M04 |
| [M07](modules/M07-critic.md) | Weakness and gap review | Not started | M02, M04 |
| [M08](modules/M08-synthesizer.md) | Structured cited report | Not started | M02, M04 |
| [M09](modules/M09-research-loop.md) | Long-horizon loop, pause, resume | Not started | M05–M08 |
| [M10](modules/M10-http-api.md) | Local API + live events | Not started | M09 |
| [M11](modules/M11-web-ui.md) | Start research, progress, download | Not started | M10 |
| [M12](modules/M12-cli.md) | One-command research run | Not started | M09 |
| [M13](modules/M13-dsh-skills.md) | DeepSeek Harness skills/plugins | Not started | M09 |
| [M14](modules/M14-domain-pack.md) | First domain pack (after MVP) | Later | M13 |
| [M15](modules/M15-docs-and-release.md) | README, license, examples | Last | M11, M12 |

Status key: `Not started` · `In progress` · `Done` · `Later`

## Current repo note

M00–M06 are signed off. Next work starts at M07 (critic).

## Success bar for the first version

Copied from the 30-day roadmap, restated as product checks:

- A new user can install from the README.
- They can type a research goal and get a multi-section report with sources.
- A run can continue for at least 30 minutes.
- Sessions can be saved and resumed.
- Another developer can read the module plans and find the matching code.

## Suggested 30-day mapping

This is a calendar hint, not a license to skip modules.

| Days | Modules |
|---|---|
| 1–4 | M00, M01, M02 |
| 5–7 | M03, M04, first end-to-end search test |
| 8–14 | M05–M09 (core research engine) |
| 15–21 | M10, M11, M12 |
| 22–30 | M13 (light), M15, demo |

M14 stays after the first public preview unless a domain pack is required for a demo.
