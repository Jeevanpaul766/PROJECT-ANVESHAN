/**
 * OpenRouter provider.
 *
 * Base URL: https://openrouter.ai/api/v1
 * Full OpenAI-compatible API that proxies 100s of models.
 *
 * Recommended free models (append :free suffix):
 *   google/gemma-3-27b-it:free
 *   meta-llama/llama-3.3-70b-instruct:free
 *   mistralai/mistral-7b-instruct:free
 *   qwen/qwen-2.5-72b-instruct:free
 *
 * Env vars (read via config.ts):
 *   OPENROUTER_API_KEY
 *   ANVESHAN_OPENROUTER_MODEL        (default: google/gemma-3-27b-it:free)
 *   ANVESHAN_OPENROUTER_FAST_MODEL
 *   ANVESHAN_OPENROUTER_SMART_MODEL
 */

import type { CallOptions, LLMProvider, ProviderResult } from "./types.js";
import type { ChatMessage } from "./types.js";
import { callOpenAiCompatible } from "./openai-compat.js";

const BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterProvider(config: {
  apiKey: string;
  model: string;
  fastModel?: string;
  smartModel?: string;
}): LLMProvider {
  const { apiKey, model } = config;

  return {
    name: "openrouter",
    get isConfigured() {
      return Boolean(apiKey);
    },

    async call(messages: ChatMessage[], options: CallOptions): Promise<ProviderResult> {
      const chosenModel = options.model ?? model;
      return callOpenAiCompatible({
        name: "openrouter",
        baseUrl: BASE_URL,
        apiKey,
        model: chosenModel,
        messages,
        options,
        // OpenRouter recommends passing site info in headers
        extraHeaders: {
          "HTTP-Referer": "https://github.com/anveshan",
          "X-Title": "Project Anveshan",
        },
      });
    },
  };
}
