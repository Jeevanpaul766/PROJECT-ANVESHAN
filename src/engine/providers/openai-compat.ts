/**
 * Shared OpenAI-compatible fetch helper.
 *
 * All four providers (Gemini, Groq, OpenRouter, HuggingFace) use the same
 * /chat/completions wire format — only the base URL, key, and model differ.
 *
 * Retry logic per call:
 *   - Quota exhaustion (429): do NOT retry — the router will fall over to the next provider.
 *   - Transient errors (500/502/503/504): retry up to 2× with jitter.
 *   - Network errors: retry up to 2×.
 *   - Abort signal: re-throw immediately.
 */

import type { CallOptions, ProviderResult } from "./types.js";
import type { ChatMessage } from "./types.js";
import { llmCounters } from "../llm.js";

const MAX_TRANSIENT_RETRIES = 2;
const RETRY_DELAYS_MS = [800, 2000];

function jitter(): number {
  return Math.floor(Math.random() * 400);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

/** True for transient server errors worth retrying within the same provider. */
function isTransient(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

export async function callOpenAiCompatible(params: {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  options: CallOptions;
  extraHeaders?: Record<string, string>;
}): Promise<ProviderResult> {
  const { name, baseUrl, apiKey, model, messages, options, extraHeaders } = params;
  const { signal, temperature = 0.3, responseFormat, maxTokens, stream = true } = options;

  const failed: ProviderResult = { text: "", usedModel: false, provider: "" };

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1] + jitter();
      console.warn(
        `[router] transient retry ${attempt}/${MAX_TRANSIENT_RETRIES} — provider=${name} model=${model} delay=${delay}ms`,
      );
      await sleep(delay);
      llmCounters.retries++;
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    llmCounters.calls++;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
        }),
        signal,
      });
    } catch (networkErr) {
      if (isAbortError(networkErr, signal)) throw networkErr;
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.error(
        `[router] network error — provider=${name} model=${model} attempt=${attempt + 1}: ${msg}`,
      );
      if (attempt < MAX_TRANSIENT_RETRIES) continue;
      llmCounters.failures++;
      return failed;
    }

    // ── Quota exhaustion — signal the router to fall over immediately ────────
    if (response.status === 429) {
      let body = "";
      try { body = (await response.text()).slice(0, 200); } catch { /* ignore */ }
      console.warn(`[router] quota hit — provider=${name} model=${model} | ${body}`);
      llmCounters.failures++;
      return failed; // router tries next provider
    }

    // ── Other non-2xx ────────────────────────────────────────────────────────
    if (!response.ok) {
      let body = "";
      try { body = (await response.text()).slice(0, 200); } catch { /* ignore */ }
      console.error(
        `[router] request failed — provider=${name} model=${model} ` +
          `status=${response.status} attempt=${attempt + 1} | ${body}`,
      );
      if (isTransient(response.status) && attempt < MAX_TRANSIENT_RETRIES) continue;
      llmCounters.failures++;
      return failed;
    }

    // ── Success (Stream or Buffered JSON) ───────────────────────────────────
    try {
      if (stream && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulated = "";
        let buffer = "";

        while (true) {
          if (signal?.aborted) {
            try { await reader.cancel(); } catch { /* ignore */ }
            throw new DOMException("Aborted", "AbortError");
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const payloadStr = trimmed.slice(5).trim();
            if (payloadStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payloadStr);
              const chunk = parsed.choices?.[0]?.delta?.content;
              if (typeof chunk === "string") {
                accumulated += chunk;
              }
            } catch {
              // Ignore non-JSON ping/keepalive chunks
            }
          }
        }

        const trimmedText = accumulated.trim();
        if (!trimmedText) {
          console.warn(`[router] empty stream content — provider=${name} model=${model}`);
          return failed;
        }
        console.log(`[router] success — provider=${name} model=${model} chars=${trimmedText.length}`);
        return { text: trimmedText, usedModel: true, provider: name };
      }

      // Non-streaming fallback
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) {
        console.warn(`[router] empty content — provider=${name} model=${model}`);
        return failed;
      }
      console.log(`[router] success — provider=${name} model=${model} chars=${text.length}`);
      return { text, usedModel: true, provider: name };
    } catch (parseErr) {
      if (isAbortError(parseErr, signal)) throw parseErr;
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error(`[router] parse error — provider=${name}: ${msg}`);
      llmCounters.failures++;
      return failed;
    }
  }

  llmCounters.failures++;
  return failed;
}
