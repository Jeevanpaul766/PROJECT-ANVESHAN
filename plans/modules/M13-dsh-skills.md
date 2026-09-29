# M13 — DeepSeek Harness skills

**Status:** Done  
**Goal:** Expose Anveshan as skills the DeepSeek Harness agent can load, without making dsh a hard install requirement.  
**Depends on:** M09  
**Unblocks:** M14, users who already run `npx @deepseek-ai/dsh web`

## Why this module exists

The product doc says the foundation is DeepSeek Harness (“everything is a plugin”). For MVP we still ship a standalone engine (M01–M12) so Anveshan works if dsh APIs move. Skills are the **bridge**.

Harness discovers skills from:

- `.dsh/skills/<name>/SKILL.md` (project)
- `.agents/skills/<name>/SKILL.md`

Skill names: kebab-case. Frontmatter must include `name` and `description`.

## What to build

### Files

| Path | Role |
|---|---|
| `.dsh/skills/anveshan-deep-research/SKILL.md` | Master skill: how to run a long research loop using this repo |
| `.dsh/skills/anveshan-orchestrator/SKILL.md` | When and how to plan |
| `.dsh/skills/anveshan-search/SKILL.md` | How to search and record provenance |
| `.dsh/skills/anveshan-critic/SKILL.md` | Critique protocol |
| `.dsh/skills/anveshan-synthesizer/SKILL.md` | Report shape and citation rules |
| `docs/dsh.md` | How to open this repo as a dsh workspace |

Each `SKILL.md` tells the harness agent to:

1. Prefer `npm run research -- "<goal>"` in this repo, **or**
2. Follow the same loop manually with tools (web, files) if Node is unavailable
3. Write findings into `data/sessions/` using the M04 file layout

Do **not** write a Cordis plugin (`apply(ctx)`) in this module unless the official dsh plugin API is stable in your installed version. Skills-first is the planned MVP path.

### Optional later (same module only if time)

A tiny dsh plugin that registers a `anveshan_research` tool calling `runResearch`. Track as a stretch checklist item, not a blocker.

## Acceptance checks

- [x] Each skill directory name matches frontmatter `name`.
- [x] Opening this folder in dsh lists `anveshan-deep-research` in the skill catalog (manual).
- [x] Standalone `npm run research` still works with dsh uninstalled.

## Done means

Harness users get Anveshan procedures; everyone else still uses the web/CLI.

## Deferred

Full Cordis bundle, custom web Chat nodes, replacing our UI with dsh web.
