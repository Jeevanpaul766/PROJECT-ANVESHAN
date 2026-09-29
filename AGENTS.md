# Working agreement for coding agents

You are maintaining **Project Anveshan** — an open Deep Research OS.

1. Maintain TypeScript strictness (`npm run typecheck`).
2. Verify all test suites (`npm test`) before committing changes.
3. Preserve the domain-agnostic architecture of the core engine and multi-agent pipeline.
4. Keep all session memory and telemetry encapsulated through `src/engine/store.ts`.
5. Maintain zero-hallucination citation integrity across all synthesizer outputs.
