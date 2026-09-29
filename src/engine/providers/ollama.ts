/**
 * Local Ollama provider (Apple Silicon / local hardware).
 * Runs completely local with zero rate limits, unlimited tokens, and zero API costs.
 *
 * Base URL: http://127.0.0.1:11434/v1
 * Models installed: qwen2.5:14b, qwen2.5:32b, qwen2.5:7b
 */

import type { CallOptions, LLMProvider, ProviderResult } from "./types.js";
import type { ChatMessage } from "./types.js";
import { callOpenAiCompatible } from "./openai-compat.js";

const BASE_URL = "http://127.0.0.1:11434/v1";

export function createOllamaProvider(config: {
  model: string;
  baseUrl?: string;
  fastModel?: string;
  smartModel?: string;
}): LLMProvider {
  const model = config.model || "qwen2.5:14b";
  const baseUrl = config.baseUrl || BASE_URL;

  return {
    name: "ollama",
    get isConfigured() {
      return true; // Always available if Ollama is running
    },

    async call(messages: ChatMessage[], options: CallOptions): Promise<ProviderResult> {
      let chosenModel = options.model ?? model;
      if (chosenModel.startsWith("ollama:")) {
        chosenModel = chosenModel.replace(/^ollama:/, "");
      }
      if (chosenModel === "ollama") {
        chosenModel = model;
      }

      return callOpenAiCompatible({
        name: "ollama",
        baseUrl,
        apiKey: "ollama",
        model: chosenModel,
        messages,
        options,
      });
    },
  };
}
