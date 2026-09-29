# M12 — CLI

**Status:** Not started  
**Goal:** Run one research job from the terminal and print the report path.  
**Depends on:** M09  
**Unblocks:** M15, headless demos

## Why this module exists

Matches DeepSeek Harness `dsh --profile headless "job"` for people who do not want a browser. Useful for the demo video.

## What to build

### Files

| Path | Role |
|---|---|
| `src/cli.ts` | argv parser |

### Usage

```
npm run research -- "Deep research on solid-state battery materials 2023-2026"
npm run research -- --resume sess_abc123
```

Flags:

- `--resume <id>`
- `--rounds <n>` overrides env for this process if easy; else skip and use env

Print:

- session id
- each event line: `[agent] message`
- final path to `report.md`

Exit codes: 0 completed, 1 failed, 130 cancelled (SIGINT → pause/cancel).

## Acceptance checks

- [ ] Ctrl+C leaves a loadable session on disk.
- [ ] Completed run prints a path that exists and contains `## Sources`.

## Done means

README can document a no-UI path.

## Deferred

Interactive TUI, streaming tokens, JSON output mode.
