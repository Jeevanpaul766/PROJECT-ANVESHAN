/**
 * OpenAlex search provider.
 * Indexes over 250M+ peer-reviewed journal papers (Nature, Science, ACS, Elsevier, Wiley, etc.).
 * 100% free, fast, open API with full DOIs and reconstructed abstracts.
 */

import { searchOpenAlex } from "../search.js";
import type { Source } from "../types.js";
import type { SearchOptions, SearchProvider } from "./types.js";

export class OpenAlexProvider implements SearchProvider {
  readonly name = "openalex";

  isAvailable(): boolean {
    return true; // Open access API, no key required
  }

  async search(query: string, options: SearchOptions = {}): Promise<Source[]> {
    return searchOpenAlex(query, options.limit ?? 5, options.signal);
  }
}
