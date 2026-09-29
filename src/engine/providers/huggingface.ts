/**
 * Hugging Face provider.
 *
 * Base URL: https://router.huggingface.co/hf-inference/v1
 * (or https://api-inference.huggingface.co/v1)
 *
 * Supported models on free serverless router:
 *   deepseek-ai/DeepSeek-R1-Distill-Qwen-32B
 *   meta-llama/Meta-Llama-3-8B-Instruct
 *   Qwen/Qwen2.5-72B-Instruct
 */

import type { CallOptions, LLMProvider, ProviderResult } from "./types.js";
import type { ChatMessage } from "./types.js";
import { callOpenAiCompatible } from "./openai-compat.js";

// HuggingFace serverless inference router endpoint
const BASE_URL = "https://router.huggingface.co/hf-inference/v1";

export function createHuggingFaceProvider(config: {
  apiKey: string;
  model: string;
  fastModel?: string;
  smartModel?: string;
}): LLMProvider {
  const { apiKey, model } = config;

  return {
    name: "huggingface",
    get isConfigured() {
      return Boolean(apiKey);
    },

    async call(messages: ChatMessage[], options: CallOptions): Promise<ProviderResult> {
      const chosenModel = options.model ?? model;
      return callOpenAiCompatible({
        name: "huggingface",
        baseUrl: BASE_URL,
        apiKey,
        model: chosenModel,
        messages,
        options,
      });
    },
  };
}
