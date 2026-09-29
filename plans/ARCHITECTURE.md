# Architecture (target)

This is the intended shape after M00–M12. Code should match it; if it does not, the code is wrong, not this sketch.

```text
                    ┌─────────────┐
                    │  Web UI M11 │
                    │  CLI M12    │
                    │  dsh M13    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  HTTP M10   │  (CLI may call engine directly)
                    └──────┬──────┘
                           │
                    ┌──────▼──────────┐
                    │  Loop M09       │
                    │  plan→search→   │
                    │  critic→report  │
                    └───┬───┬───┬───┬─┘
               ┌────────┘   │   │   └────────┐
               ▼            ▼   ▼            ▼
            M05           M06  M07          M08
         Orchestrator   Search Critic   Synthesizer
                            │
                            ▼
                          M03 sources
               arXiv / Semantic Scholar / web

                    ┌─────────────┐
                    │ Store M04   │  data/sessions/<id>/*.json
                    └─────────────┘

                    ┌─────────────┐
                    │ LLM M02     │  OpenAI-compatible
                    └─────────────┘
```

Agents never open HTTP servers or write ad-hoc files. The loop owns status. The store owns disk.
