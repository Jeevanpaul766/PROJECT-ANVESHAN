# M15 — Docs, demo, and first public preview

**Status:** Done  
**Goal:** Someone else can install Anveshan, run a goal, and understand how to add a skill.  
**Depends on:** M11, M12 (M13 recommended)  
**Unblocks:** sharing (“Project Anveshan – Early Preview”)

## Why this module exists

Week 4 of the roadmap: clean install path, architecture note, GitHub-ready tree. Do this last so the README matches real commands.

## What to write

| Path | Role |
|---|---|
| `README.md` | Install (Node 20+, optional Ollama), `npm install`, `cp .env.example .env`, `npm run dev`, CLI usage |
| `LICENSE` | MIT (roadmap recommendation) |
| `CONTRIBUTING.md` | “Add a module by following `plans/BUILD.md`” |
| `docs/architecture.md` | Diagram of agents + store + API; pointer to plans |
| `docs/adding-a-skill.md` | Copy a `.dsh/skills` folder |
| `examples/reports/` | 1–2 anonymized Markdown reports from real runs |
| `AGENTS.md` | For coding agents: follow `plans/BUILD.md`, one module at a time |

### README must include

- What Anveshan is (3–5 sentences, no hype)
- Local-first / free-first model order
- Troubleshooting: Ollama not running (search still works; writing is weaker)
- Link to the two original `.docx` specs

### Explicitly not in this module

Demo video recording (you do that by hand). GitHub remote + social posts (you do that by hand). This module only prepares the repo.

## Acceptance checks

- [x] Follow README on a clean terminal session (or a friend) without extra tribal knowledge.
- [x] License file present.
- [x] Example report has working source URLs.

## Done means

The 30-day “shareable early preview” bar is met on paper. Publishing is a human step.
