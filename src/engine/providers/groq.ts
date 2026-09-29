/**
 * Groq provider.
 *
 * Base URL: https://api.groq.com/openai/v1
 * Full OpenAI-compatible API.
 *
 * Free-tier models (as of 2026):
 *   llama-3.3-70b-versatile   — best free general model
 *   llama3-8b-8192            — fast/light
 *   mixtral-8x7b-32768        — 32k context
 *   gemma2-9b-it              — Google Gemma
 *
 * Env vars (read via config.ts):
 *   GROQ_API_KEY
 *   ANVESHAN_GROQ_MODEL        (default: llama-3.3-70b-versatile)
 *   ANVESHAN_GROQ_FAST_MODEL
 *   ANVESHAN_GROQ_SMART_MODEL
 */

import type { CallOptions, LLMProvider, ProviderResult } from "./types.js";
import type { ChatMessage } from "./types.js";
import { callOpenAiCompatible } from "./openai-compat.js";

const BASE_URL = "https://api.groq.com/openai/v1";

export function createGroqProvider(config: {
  apiKey: string;
  model: string;
  fastModel?: string;
  smartModel?: string;
}): LLMProvider {
  const { apiKey, model } = config;

  return {
    name: "groq",
    get isConfigured() {
      return Boolean(apiKey);
    },

    async call(messages: ChatMessage[], options: CallOptions): Promise<ProviderResult> {
      const chosenModel = options.model ?? model;
      return callOpenAiCompatible({
        name: "groq",
        baseUrl: BASE_URL,
        apiKey,
        model: chosenModel,
        messages,
        options,
      });
    },
  };
}
