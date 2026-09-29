# Contributing to Project Anveshan

Thank you for your interest in contributing to **Project Anveshan** — an open Deep Research OS for long-horizon, sourced investigation.

## Contribution Workflow

Project Anveshan is engineered under a strict modular discipline:

1. **Focus on single subsystems**: Keep enhancements and bug fixes scoped to a single agent or engine subsystem.
2. **Strict TypeScript & Contracts**: Ensure all domain types in `src/engine/types.ts` remain strictly typed and validated.
3. **Verify acceptance checks**: Ensure all unit tests, probes, and typechecks pass before submitting changes.
4. **No premature dependencies**: Avoid adding external dependencies unless strictly necessary for core functionality.

## Repository Layout

```text
src/
├── engine/              # Core research OS scheduler and engine
│   ├── agents/          # Orchestrator, search agent, evidence extractor, critic, synthesizer
│   ├── search/          # Multi-provider search backends (arXiv, Semantic Scholar, Brave)
│   ├── loop.ts          # Main research execution loop (runResearch)
│   ├── store.ts         # Session disk memory & provenance store (data/sessions)
│   ├── llm.ts           # OpenAI-compatible multi-provider LLM client
│   └── quality.ts       # Source authority and claim scoring
├── server/              # Local Express HTTP API & SSE event stream (127.0.0.1:4747)
├── cli.ts               # Terminal entry point (npm run research)
├── scripts/             # Isolated verification probes for each subsystem
└── tests/               # Automated unit and integration test suites
web/                     # Local-first React + Vite research dashboard
sdk/python/              # Production Python SDK, LangChain tools & LangGraph nodes
docs/                    # Architecture, Agentic AI treatise, and visual assets
```

## Development Guidelines

### Code Style & Standards
- **TypeScript strict**: All new code must be strictly typed. Run `npm run typecheck` to verify with zero compiler warnings or errors.
- **Node.js ESM**: Use ES modules (`import`/`export`), explicit file extensions (`.js`), and Node.js `>=20` APIs.
- **Storage encapsulation**: Never write arbitrary files to disk directly. Always route session state, metadata, findings, critiques, and reports through `src/engine/store.ts`.
- **Zero domain-specific hardcoding**: The core engine, prompts, and synthesizer must remain domain-agnostic. Research topics are specified dynamically by the user.
- **Source provenance**: Every finding must be linked to a verifiable source (`url`, `title`, `author`, `year`).

### Testing & Verification
Before submitting a pull request, run the test and typecheck suites:

```bash
# Typecheck TypeScript codebase
npm run typecheck

# Run unit and integration tests
npm test

# Run subsystem probe scripts
npm run probe:llm
npm run probe:search
npm run probe:store
npm run probe:orchestrator
npm run probe:critic
npm run probe:synthesizer
npm run probe:loop
npm run probe:api
```

## Adding Skills
To add a skill for DeepSeek Harness or coding agents, see [docs/adding-a-skill.md](docs/adding-a-skill.md).

## Submitting Pull Requests
- Keep PRs focused on a single module or bug fix.
- Ensure all tests pass.
- Write concise, descriptive commit messages.
