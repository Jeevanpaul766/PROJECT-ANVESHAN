/**
 * Google Gemini provider.
 *
 * Uses Gemini's native generateContent REST endpoint:
 *   https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
 *
 * Free-tier model:
 *   gemini-3.6-flash
 */

import type { CallOptions, LLMProvider, ProviderResult } from "./types.js";
import type { ChatMessage } from "./types.js";
import { llmCounters } from "../llm.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export function createGeminiProvider(config: {
  apiKey: string;
  model: string;
  fastModel?: string;
  smartModel?: string;
}): LLMProvider {
  const { apiKey, model } = config;

  return {
    name: "gemini",
    get isConfigured() {
      return Boolean(apiKey);
    },

    async call(messages: ChatMessage[], options: CallOptions): Promise<ProviderResult> {
      const chosenModel = options.model ?? model;
      const { signal, temperature = 0.3, responseFormat } = options;
      const failed: ProviderResult = { text: "", usedModel: false, provider: "" };

      if (!apiKey) return failed;
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      llmCounters.calls++;

      // Convert messages to Gemini format
      // System instructions vs contents
      const systemMessages = messages.filter((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      const systemInstruction = systemMessages.length > 0
        ? { parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }] }
        : undefined;

      const contents = conversationMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const body: any = {
        contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "Hello" }] }],
        generationConfig: {
          temperature,
          ...(responseFormat === "json_object" ? { responseMimeType: "application/json" } : {}),
        },
      };

      if (systemInstruction) {
        body.systemInstruction = systemInstruction;
      }

      try {
        const url = `${BASE_URL}/${chosenModel}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });

        if (response.status === 429) {
          console.warn(`[router] Gemini quota limit reached (429) — falling back to next provider`);
          llmCounters.failures++;
          return failed;
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          console.error(`[router] Gemini request failed status=${response.status}: ${errText.slice(0, 200)}`);
          llmCounters.failures++;
          return failed;
        }

        const data: any = await response.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text?.trim() ?? "";

        if (!text) {
          console.warn(`[router] Gemini empty response`);
          llmCounters.failures++;
          return failed;
        }

        console.log(`[router] success — provider=gemini model=${chosenModel} chars=${text.length}`);
        return { text, usedModel: true, provider: "gemini" };
      } catch (err: any) {
        if (signal?.aborted) throw err;
        console.error(`[router] Gemini fetch error: ${err.message}`);
        llmCounters.failures++;
        return failed;
      }
    },
  };
}
