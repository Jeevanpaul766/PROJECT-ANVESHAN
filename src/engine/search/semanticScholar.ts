/**
 * Semantic Scholar search provider — wraps the existing searchSemanticScholar().
 * Phase 2: no behavior change; just adapts to SearchProvider interface.
 */

import { searchSemanticScholar } from "../search.js";
import type { Source } from "../types.js";
import type { SearchProvider, SearchOptions } from "./types.js";

export class SemanticScholarProvider implements SearchProvider {
  readonly name = "semantic-scholar";

  isAvailable(): boolean {
    return true; // Public API, no key required
  }

  async search(query: string, options: SearchOptions = {}): Promise<Source[]> {
    return searchSemanticScholar(query, options.limit ?? 5, options.signal);
  }
}
