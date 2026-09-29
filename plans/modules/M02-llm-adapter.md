# M02 — LLM adapter

**Status:** Done  
**Goal:** One function that talks to any OpenAI-compatible chat API, including Ollama, and fails softly when the model is down.  
**Depends on:** M01  
**Unblocks:** M05, M07, M08

## Why this module exists

The roadmap uses local models first, then DeepSeek, then Qwen. The rest of the app must not care which vendor is behind the URL.

## What to build

### Files

| Path | Role |
|---|---|
| `src/engine/llm.ts` | `chat`, `chatJson`, `probeLlm` |

### Behavior

`chat(messages, options) → { text, usedModel }`

- POST `{baseUrl}/chat/completions`
- Header `Authorization: Bearer {apiKey}`
- Body: `model`, `messages`, `temperature`, `stream: false` for this module (streaming is M10 if needed)
- On network failure, 4xx/5xx, or empty content: return `{ text: "", usedModel: false }` unless the caller aborted
- Abort via `AbortSignal`

`chatJson<T>(messages, fallback, signal)`

- Calls `chat`
- Parses JSON from the reply (allow fenced ```json blocks)
- On parse failure or `usedModel: false`, return the fallback

`probeLlm()`

- Tiny ping used by the API health route later
- Returns `{ ok, model, detail }`

### Heuristic fallback rule (product-level)

When `usedModel` is false, **agents still run** using deterministic fallbacks defined in M05–M08. The adapter does not invent research content.

### Model usage (from the product roadmap)

Do not encode vendor names in agent code. Only env changes:

| Job | Suggested model | When |
|---|---|---|
| Daily dev | Ollama local | Default |
| Fast filter | DeepSeek V4 Flash | After local is not enough |
| Planning / critique | DeepSeek V4 Pro | Quality step-up |
| Final report | Qwen 3.8 Max | Optional, last pass |

## Acceptance checks

- [ ] With Ollama running and `ANVESHAN_LLM_MODEL` pulled, `probeLlm().ok === true`. *(not verified here — Ollama was offline)*
- [x] With Ollama stopped, `probeLlm().ok === false` and no thrown crash.
- [x] `chatJson` returns the fallback object when the model is offline.
- [x] No other file talks to the LLM HTTP API except `llm.ts`.

### Manual probe (after this module)

Create a throwaway `src/scripts/probe-llm.ts` **or** run a few lines in the Node REPL. Delete the script before M15 if it is not needed.

## Done means

Agents can be written against `chat` / `chatJson` only.

## Deferred

Streaming tokens, TokenRouter, multiple models in one run, cost accounting.
