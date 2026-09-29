/**
 * arXiv search provider — wraps the existing searchArxiv() from search.ts.
 * Phase 2: no behavior change; just adapts to SearchProvider interface.
 */

import { searchArxiv } from "../search.js";
import type { Source } from "../types.js";
import type { SearchProvider, SearchOptions } from "./types.js";

export class ArxivProvider implements SearchProvider {
  readonly name = "arxiv";

  isAvailable(): boolean {
    return true; // No API key required
  }

  async search(query: string, options: SearchOptions = {}): Promise<Source[]> {
    return searchArxiv(query, options.limit ?? 5, options.signal);
  }
}
