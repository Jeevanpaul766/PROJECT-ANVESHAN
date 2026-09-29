/**
 * Web search provider (DuckDuckGo with snippet extraction).
 * Used for techno-economic cost estimates, market forecasts, and industry reports.
 */

import { searchWeb } from "../search.js";
import type { Source } from "../types.js";
import type { SearchOptions, SearchProvider } from "./types.js";

export class WebSearchProvider implements SearchProvider {
  readonly name = "web";

  isAvailable(): boolean {
    return true; // No key required
  }

  async search(query: string, options: SearchOptions = {}): Promise<Source[]> {
    return searchWeb(query, options.limit ?? 5, options.signal);
  }
}
