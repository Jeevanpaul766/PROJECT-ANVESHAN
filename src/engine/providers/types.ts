/**
 * Shared types for the multi-provider LLM router.
 * Each provider implements ProviderConfig and returns ProviderResult.
 */

import type { ChatMessage } from "../llm.js";

export type { ChatMessage };

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  /** Human-readable provider name used in logs. */
  name: string;
  /** API key — router skips this provider if empty. */
  apiKey: string;
  /** Base URL for the OpenAI-compatible /chat/completions endpoint. */
  baseUrl: string;
  /** Default model ID to use for this provider. */
  model: string;
  /**
   * Optional fast model override — lighter/cheaper for extraction tasks.
   * Falls back to `model` if empty.
   */
  fastModel?: string;
  /**
   * Optional smart model override — more powerful for synthesis/critique.
   * Falls back to `model` if empty.
   */
  smartModel?: string;
}

// ---------------------------------------------------------------------------
// Per-call options
// ---------------------------------------------------------------------------

export interface CallOptions {
  temperature?: number;
  signal?: AbortSignal;
  /** Override the provider's default model for this call. */
  model?: string;
  responseFormat?: "json_object";
  maxTokens?: number;
  stream?: boolean;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ProviderResult {
  text: string;
  /** true when a real model replied; false on any failure or fallback. */
  usedModel: boolean;
  /** Which provider ultimately responded (empty string if all failed). */
  provider: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface LLMProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  call(messages: ChatMessage[], options: CallOptions): Promise<ProviderResult>;
}
