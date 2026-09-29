---
name: anveshan-search
description: >
  Guides an agent through Project Anveshan's multi-provider search layer.
  Use when extending or debugging the arXiv, Semantic Scholar, or Brave
  search providers, or when adding a new search backend.
---

# Anveshan Search Skill

## Architecture (Phase 2)

```
search/
├── types.ts          — SearchProvider interface + SearchOptions
├── manager.ts        — Multi-provider fanout + URL deduplication
├── arxiv.ts          — Wraps searchArxiv() from ../search.ts
├── semanticScholar.ts — Wraps searchSemanticScholar() from ../search.ts
└── brave.ts          — Brave Search API provider

search.ts             — UNCHANGED backward-compat layer (do not modify)
```

## SearchProvider Interface

Every provider implements this contract:

```typescript
export interface SearchProvider {
  readonly name: string;
  isAvailable(): boolean;            // Returns false if API key missing
  search(query: string, options?: SearchOptions): Promise<Source[]>;
}
```

- **`isAvailable()`** — If false, `SearchManager` silently skips the provider.  
  No key → no error.
- **`search()`** — Must return normalized `Source[]`, never throw on API errors.  
  Log errors with `console.error`, return `[]`.
- **Abort**: check `options.signal` and rethrow `AbortError` only.

## Adding a New Provider

1. Create `src/engine/search/myprovider.ts` implementing `SearchProvider`.
2. Register it in `search/manager.ts` → `createSearchManager()`.
3. Add the API key env var to `config.ts` and `.env.example`.
4. Set `isAvailable()` to check if the key is non-empty.

## Brave Search API

- Endpoint: `https://api.search.brave.com/res/v1/web/search`
- Auth header: `X-Subscription-Token: <key>`
- Response shape: `{ web: { results: [{ title, url, description, age }] } }`
- Free tier: 2000 queries/month — https://brave.com/search/api/
- Env var: `ANVESHAN_BRAVE_API_KEY`

## SearchManager

`createSearchManager()` builds a manager with all configured providers.  
Results are deduplicated by URL (lowercased). Provider errors are isolated —  
one failing provider does not block the others.

```typescript
const manager = createSearchManager();
const sources = await manager.search("query", { limit: 5, signal });
```

## Debugging Tips

- `manager.providerNames` lists which providers are active.
- Test individual providers by instantiating them directly:
  ```typescript
  const brave = new BraveSearchProvider(process.env.ANVESHAN_BRAVE_API_KEY!);
  console.log(brave.isAvailable());
  console.log(await brave.search("test query", { limit: 3 }));
  ```
- Brave returns 401 on bad key, 429 on rate limit — both are logged and 
  gracefully return `[]`.

## Source Normalization

All providers return `Source[]` with these fields:

| Field | Required | Notes |
|---|---|---|
| `kind` | ✅ | `"arxiv"`, `"semantic-scholar"`, `"brave"`, etc. |
| `title` | ✅ | Non-empty |
| `url` | ✅ | Must start with `https://` |
| `snippet` | Optional | Max 700 chars |
| `year` | Optional | `number \| undefined` |
| `authors` | Optional | `string[]` |
| `venue` | Optional | Journal/hostname |

Invalid sources (missing `url` or `title`) are dropped by the manager.
