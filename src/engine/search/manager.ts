/**
 * Multi-provider search manager with In-Memory TTL Cache and Metrics.
 * Phase 6: lightweight in-memory cache with 15-minute default TTL (ANVESHAN_SEARCH_CACHE_TTL_MS).
 * Avoids duplicate HTTP requests across queries and rounds.
 */

import { BRAVE, intEnv } from "../config.js";
import type { Source } from "../types.js";
import type { SearchProvider, SearchOptions } from "./types.js";
import { OpenAlexProvider } from "./openalex.js";
import { CrossrefProvider } from "./crossref.js";
import { ArxivProvider } from "./arxiv.js";
import { WebSearchProvider } from "./web.js";
import { SemanticScholarProvider } from "./semanticScholar.js";
import { BraveSearchProvider } from "./brave.js";

// ---------------------------------------------------------------------------
// Search Cache & Observability
// ---------------------------------------------------------------------------

interface CacheEntry {
  sources: Source[];
  expiresAt: number;
}

export const searchMetrics = {
  totalSearches: 0,
  cacheHits: 0,
  cacheMisses: 0,
  httpRequests: 0,
};

class SearchCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor() {
    this.ttlMs = intEnv("ANVESHAN_SEARCH_CACHE_TTL_MS", 900_000); // 15 minutes default
  }

  private normalizeKey(query: string, limit: number): string {
    const norm = query
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ");
    return `${norm}::${limit}`;
  }

  get(query: string, limit: number): Source[] | null {
    const key = this.normalizeKey(query, limit);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.sources;
  }

  set(query: string, limit: number, sources: Source[]): void {
    if (sources.length === 0) return; // Don't cache empty failures
    const key = this.normalizeKey(query, limit);
    this.store.set(key, {
      sources,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.store.clear();
  }
}

export const globalSearchCache = new SearchCache();

// ---------------------------------------------------------------------------
// Abort detection helper
// ---------------------------------------------------------------------------

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class SearchManager {
  private readonly providers: SearchProvider[];

  constructor(providers: SearchProvider[]) {
    // Only keep providers that are ready to use
    this.providers = providers.filter((p) => p.isAvailable());
  }

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  /**
   * Run the query against all available providers in parallel.
   * Uses in-memory TTL cache to skip repeated network queries.
   */
  async search(query: string, options: SearchOptions = {}): Promise<Source[]> {
    searchMetrics.totalSearches++;
    const limit = options.limit ?? 5;

    // Check cache
    const cached = globalSearchCache.get(query, limit);
    if (cached) {
      searchMetrics.cacheHits++;
      return cached;
    }

    searchMetrics.cacheMisses++;

    searchMetrics.httpRequests += this.providers.length;

    const settled = await Promise.allSettled(
      this.providers.map((p) => p.search(query, options)),
    );

    // If the abort signal fired, surface the abort
    for (const item of settled) {
      if (item.status === "rejected" && isAbortError(item.reason, options.signal)) {
        throw item.reason;
      }
    }

    const seen = new Set<string>();
    const sources: Source[] = [];

    for (const item of settled) {
      if (item.status !== "fulfilled") continue;
      for (const source of item.value) {
        if (!source.url || !source.title) continue;
        const key = source.url.toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        if (!/^https?:\/\//i.test(source.url)) continue;
        seen.add(key);
        sources.push(source);
      }
    }

    // Save to cache
    globalSearchCache.set(query, limit, sources);

    return sources;
  }
}

// ---------------------------------------------------------------------------
// Default manager factory
// ---------------------------------------------------------------------------

/** Create a SearchManager with all configured academic and web providers. */
export function createSearchManager(): SearchManager {
  return new SearchManager([
    new OpenAlexProvider(),       // Peer-reviewed Nature, Science, ACS, Elsevier, etc.
    new CrossrefProvider(),       // Publisher DOIs and journal records
    new ArxivProvider(),          // Recent preprints
    new WebSearchProvider(),        // Web articles with techno-economic & cost data
    new SemanticScholarProvider(), // Semantic Scholar (with graceful fallback)
    new BraveSearchProvider(BRAVE.apiKey),
  ]);
}
