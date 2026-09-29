/**
 * Search provider interface for Project Anveshan.
 * Phase 2: abstraction layer over multiple search backends.
 */

import type { Source } from "../types.js";

export interface SearchOptions {
  limit?: number;
  signal?: AbortSignal;
}

/**
 * A pluggable search provider.
 * All providers return normalized Source objects.
 */
export interface SearchProvider {
  readonly name: string;
  /** True when the provider is usable (e.g., API key present). */
  isAvailable(): boolean;
  search(query: string, options?: SearchOptions): Promise<Source[]>;
}
