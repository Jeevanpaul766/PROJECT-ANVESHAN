/**
 * Crossref search provider.
 * Resolves publisher DOIs, journal venues, and publication records.
 * 100% free and open.
 */

import { searchCrossref } from "../search.js";
import type { Source } from "../types.js";
import type { SearchOptions, SearchProvider } from "./types.js";

export class CrossrefProvider implements SearchProvider {
  readonly name = "crossref";

  isAvailable(): boolean {
    return true; // Open access API, no key required
  }

  async search(query: string, options: SearchOptions = {}): Promise<Source[]> {
    return searchCrossref(query, options.limit ?? 5, options.signal);
  }
}
