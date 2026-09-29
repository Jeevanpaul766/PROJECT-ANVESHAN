/**
 * LLM client — Phase 3: multi-provider waterfall router.
 * Spec: plans/modules/M02-llm-adapter.md
 *
 * Public API is UNCHANGED — chat() and chatJson() work exactly as before.
 * Internally, requests go through the waterfall router:
 *   Gemini → Groq → OpenRouter → HuggingFace
 *
 * No local / Ollama dependency remains.
 */

export { resolveModel } from "./config.js";
export type { ModelRole } from "./config.js";

// ---------------------------------------------------------------------------
// Observability counters (shared with providers/openai-compat.ts)
// ---------------------------------------------------------------------------

export const llmCounters = {
  calls: 0,
  failures: 0,
  retries: 0,
};

// ---------------------------------------------------------------------------
// Message and result types (public API — unchanged)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  usedModel: boolean;
}

// ---------------------------------------------------------------------------
// JSON extraction helper (unchanged)
// ---------------------------------------------------------------------------

export function extractJson(text: string): unknown {
  // Strip reasoning blocks (e.g. <think>...</think> from Qwen or Nemotron)
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? cleaned).trim();
  const start = raw.search(/[\[{]/);
  if (start < 0) throw new Error("No JSON object in model output");

  let end = raw.length;
  if (!fenced) {
    const lastBrace = raw.lastIndexOf("}");
    const lastBracket = raw.lastIndexOf("]");
    const actualEnd = Math.max(lastBrace, lastBracket);
    if (actualEnd >= start) end = actualEnd + 1;
  }

  return JSON.parse(raw.slice(start, end));
}

// ---------------------------------------------------------------------------
// Abort helper
// ---------------------------------------------------------------------------

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public API — identical signatures to previous phases
// ---------------------------------------------------------------------------

export async function chat(
  messages: ChatMessage[],
  options: {
    temperature?: number;
    signal?: AbortSignal;
    model?: string;
    responseFormat?: "json_object";
    maxTokens?: number;
    stream?: boolean;
  } = {},
): Promise<ChatResult> {
  // Lazy import — avoids circular-dependency issues at module init time
  const { callRouter } = await import("./providers/router.js");

  try {
    const result = await callRouter(messages, options);
    return { text: result.text, usedModel: result.usedModel };
  } catch (error) {
    if (isAbortError(error, options.signal)) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[llm] unexpected error — ${msg}`);
    llmCounters.failures++;
    return { text: "", usedModel: false };
  }
}

export async function chatJson<T>(
  messages: ChatMessage[],
  fallback: T,
  signal?: AbortSignal,
  model?: string,
): Promise<{ value: T; usedModel: boolean }> {
  const result = await chat(messages, { signal, model, responseFormat: "json_object" });
  if (!result.usedModel || !result.text) {
    return { value: fallback, usedModel: false };
  }
  try {
    return { value: extractJson(result.text) as T, usedModel: true };
  } catch (error) {
    console.warn(
      `[llm] JSON extraction failed — falling back to heuristic. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.warn(`[llm] Raw output was: ${result.text.substring(0, 500)}...`);
    return { value: fallback, usedModel: false };
  }
}

// ---------------------------------------------------------------------------
// Probe — now tests the full waterfall router
// ---------------------------------------------------------------------------

export async function probeLlm(): Promise<{
  ok: boolean;
  model: string;
  detail: string;
}> {
  const { probeRouter } = await import("./providers/router.js");
  const result = await probeRouter();
  return {
    ok: result.ok,
    model: result.ok ? `${result.provider}/${result.model}` : "",
    detail: result.detail,
  };
}

// ---------------------------------------------------------------------------
// Model list — best-effort from the first configured provider
// ---------------------------------------------------------------------------

export async function getAvailableModels(): Promise<string[]> {
  const { listModels } = await import("./providers/router.js");
  return listModels();
}
