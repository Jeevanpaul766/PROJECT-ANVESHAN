/**
 * Brave Search API provider.
 * Phase 2: structured web results with real snippets.
 *
 * Configuration: ANVESHAN_BRAVE_API_KEY in .env
 * Free tier: https://brave.com/search/api/ — 2000 queries/month
 *
 * If the key is absent, isAvailable() returns false and search() returns [].
 * Failures are logged but do not throw (fail gracefully).
 */

import type { Source } from "../types.js";
import type { SearchProvider, SearchOptions } from "./types.js";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const UA = "ProjectAnveshan/0.2 (research; phase2)";

/** Extract a 4-digit year from Brave's age strings like "2024-03-15" or "3 days ago". */
function extractYear(age: string): number | undefined {
  const m = age.match(/\b(20\d{2}|19\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  meta_url?: { hostname?: string };
  profile?: { name?: string };
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async search(query: string, options: SearchOptions = {}): Promise<Source[]> {
    if (!this.isAvailable()) return [];

    const limit = options.limit ?? 5;
    const url =
      `${BRAVE_ENDPOINT}?` +
      new URLSearchParams({
        q: query,
        count: String(Math.min(limit, 20)),
        search_lang: "en",
      });

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": this.apiKey,
          "User-Agent": UA,
        },
        signal: options.signal,
      });

      if (!response.ok) {
        let body = "";
        try { body = (await response.text()).slice(0, 200); } catch { /* ignore */ }
        console.error(
          `[brave] search failed — status=${response.status} query="${query.slice(0, 60)}" body="${body}"`,
        );
        return [];
      }

      const data = (await response.json()) as BraveResponse;
      const results = data?.web?.results ?? [];

      return results.slice(0, limit).map((r): Source => ({
        kind: "brave",
        title: (r.title ?? "Untitled").trim(),
        url: r.url ?? "",
        snippet: (r.description ?? "").slice(0, 700),
        year: r.age ? extractYear(r.age) : undefined,
        venue: r.meta_url?.hostname ?? r.profile?.name,
      })).filter((s) => s.url && s.title);
    } catch (error) {
      if (isAbortError(error, options.signal)) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[brave] search error — query="${query.slice(0, 60)}" error="${msg}"`);
      return [];
    }
  }
}
