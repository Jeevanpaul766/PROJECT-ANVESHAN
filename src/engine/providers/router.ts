/**
 * Multi-Provider Waterfall Router with Local Ollama and Cloud Integration.
 *
 * Supports:
 *   - Local Ollama: qwen2.5:14b, qwen2.5:32b, qwen2.5:7b (Apple Silicon / local)
 *   - Cloud Providers: Gemini, Groq, OpenRouter, HuggingFace
 *
 * Direct routing:
 *   - If model starts with `ollama:` or is `qwen2.5:*` -> routed directly to local Ollama.
 *   - If model starts with `groq:` -> routed to Groq.
 *   - If model starts with `gemini:` -> routed to Gemini.
 *   - If model starts with `openrouter:` -> routed to OpenRouter.
 *
 * Waterfall mode:
 *   - Tries Gemini -> Groq -> OpenRouter -> Local Ollama
 */

import { PROVIDERS, TOKEN_BUDGETS, RATE_LIMITS } from "../config.js";
import { createGeminiProvider } from "./gemini.js";
import { createGroqProvider } from "./groq.js";
import { createOpenRouterProvider } from "./openrouter.js";
import { createHuggingFaceProvider } from "./huggingface.js";
import { createOllamaProvider } from "./ollama.js";
import { estimateTokens, pruneMessages, configureRateLimits, rateLimiter } from "./tokenBudget.js";
import type { CallOptions, LLMProvider, ProviderResult } from "./types.js";
import type { ChatMessage } from "./types.js";

// ---------------------------------------------------------------------------
// Initialize rate limiter configs at module load time
// ---------------------------------------------------------------------------

configureRateLimits(RATE_LIMITS);

// ---------------------------------------------------------------------------
// Build the provider map (lazy singleton)
// ---------------------------------------------------------------------------

let _ollamaProvider: LLMProvider | null = null;
let _cloudProviders: LLMProvider[] | null = null;

function getOllamaProvider(): LLMProvider {
  if (!_ollamaProvider) {
    _ollamaProvider = createOllamaProvider(PROVIDERS.ollama);
  }
  return _ollamaProvider;
}

function getCloudProviders(): LLMProvider[] {
  if (_cloudProviders) return _cloudProviders;

  _cloudProviders = [
    createGeminiProvider(PROVIDERS.gemini),
    createGroqProvider(PROVIDERS.groq),
    createOpenRouterProvider(PROVIDERS.openrouter),
    createHuggingFaceProvider(PROVIDERS.huggingface),
  ];

  const configured = _cloudProviders.filter((p) => p.isConfigured);
  console.log(
    `[router] Providers ready: ${configured.map((p) => p.name).join(" → ")} (Local: Ollama)`,
  );

  return _cloudProviders;
}

// ---------------------------------------------------------------------------
// Core waterfall call with explicit routing
// ---------------------------------------------------------------------------

const EMPTY: ProviderResult = { text: "", usedModel: false, provider: "" };

export async function callRouter(
  messages: ChatMessage[],
  options: CallOptions = {},
): Promise<ProviderResult> {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const reqModel = (options.model || "").trim();

  // ── 1. Direct Local Ollama route ──────────────────────────────────────────
  if (
    reqModel.startsWith("ollama:") ||
    reqModel.startsWith("qwen2.5") ||
    reqModel === "ollama"
  ) {
    const cleanModel = reqModel.replace(/^ollama:/, "");
    const ollama = getOllamaProvider();
    const budget = TOKEN_BUDGETS.ollama ?? 32_000;
    const pruned = pruneMessages(messages, budget);

    const res = await ollama.call(pruned, { ...options, model: cleanModel });
    if (res.usedModel) return res;
    console.warn(`[router] Local Ollama failed, falling back to cloud router`);
  }

  // ── 2. Direct Cloud Provider route ─────────────────────────────────────────
  if (reqModel.startsWith("gemini:")) {
    const cleanModel = reqModel.replace(/^gemini:/, "");
    const gemini = createGeminiProvider(PROVIDERS.gemini);
    if (gemini.isConfigured) {
      const res = await gemini.call(pruneMessages(messages, TOKEN_BUDGETS.gemini), { ...options, model: cleanModel });
      if (res.usedModel) return res;
    }
  }

  if (reqModel.startsWith("groq:")) {
    const cleanModel = reqModel.replace(/^groq:/, "");
    const groq = createGroqProvider(PROVIDERS.groq);
    if (groq.isConfigured) {
      const res = await groq.call(pruneMessages(messages, TOKEN_BUDGETS.groq), { ...options, model: cleanModel });
      if (res.usedModel) return res;
    }
  }

  if (reqModel.startsWith("openrouter:")) {
    const cleanModel = reqModel.replace(/^openrouter:/, "");
    const openrouter = createOpenRouterProvider(PROVIDERS.openrouter);
    if (openrouter.isConfigured) {
      const res = await openrouter.call(pruneMessages(messages, TOKEN_BUDGETS.openrouter), { ...options, model: cleanModel });
      if (res.usedModel) return res;
    }
  }

  // ── 3. Waterfall: Gemini -> Groq -> OpenRouter -> Local Ollama ────────────
  const cloudProviders = getCloudProviders();

  for (const provider of cloudProviders) {
    if (!provider.isConfigured) continue;
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const budget = TOKEN_BUDGETS[provider.name] ?? 12_000;
    const prunedMessages = pruneMessages(messages, budget);
    const estimatedToks = estimateTokens(prunedMessages);

    // Rate limit
    const waited = await rateLimiter.waitIfNeeded(provider.name, estimatedToks);
    if (waited > 0) {
      console.log(`[router] rate-limit wait: ${waited}ms for provider=${provider.name}`);
    }

    const providerCfg = PROVIDERS[provider.name as keyof typeof PROVIDERS];
    const callOptions = {
      ...options,
      model: options.model && options.model === providerCfg?.model ? options.model : undefined,
    };

    const result = await provider.call(prunedMessages, callOptions);
    if (result.usedModel) {
      return result;
    }

    console.warn(`[router] provider=${provider.name} failed — trying next provider`);
  }

  // ── 4. Final Local Ollama fallback if cloud is exhausted ──────────────────
  try {
    const ollama = getOllamaProvider();
    const result = await ollama.call(pruneMessages(messages, TOKEN_BUDGETS.ollama), options);
    if (result.usedModel) {
      console.log(`[router] cloud exhausted — answered by local Ollama (${result.text.length} chars)`);
      return result;
    }
  } catch (err: any) {
    console.warn(`[router] Local Ollama fallback unavailable: ${err.message}`);
  }

  console.error("[router] All providers exhausted. Returning empty result.");
  return EMPTY;
}

// ---------------------------------------------------------------------------
// Probe: health check
// ---------------------------------------------------------------------------

export async function probeRouter(): Promise<{
  ok: boolean;
  provider: string;
  model: string;
  detail: string;
}> {
  // 1. Try local Ollama probe
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags");
    if (res.ok) {
      const data: any = await res.json();
      const first = data.models?.[0]?.name || "qwen2.5:14b";
      return {
        ok: true,
        provider: "ollama",
        model: first,
        detail: `Local Ollama is online with ${data.models?.length || 0} models.`,
      };
    }
  } catch {
    /* continue to cloud probe */
  }

  // 2. Try cloud providers
  const providers = getCloudProviders().filter((p) => p.isConfigured);
  for (const provider of providers) {
    const result = await provider.call(
      [
        { role: "system", content: "Reply with the single word ok." },
        { role: "user", content: "ping" },
      ],
      { temperature: 0 },
    );

    if (result.usedModel) {
      const cfg = PROVIDERS[provider.name as keyof typeof PROVIDERS];
      const model = cfg?.model ?? "unknown";
      return {
        ok: true,
        provider: provider.name,
        model,
        detail: `Provider ${provider.name} is reachable.`,
      };
    }
  }

  return {
    ok: false,
    provider: "",
    model: "",
    detail: "No LLM providers reachable.",
  };
}

// ---------------------------------------------------------------------------
// List all available model choices (for UI dropdown)
// ---------------------------------------------------------------------------

export async function listModels(): Promise<string[]> {
  const models: string[] = [
    "ollama:qwen2.5:14b",
    "ollama:qwen2.5:32b",
    "ollama:qwen2.5:7b",
    "cloud-router",
    "groq:qwen/qwen3.6-27b",
    "gemini:gemini-3.6-flash",
    "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
  ];

  return models;
}
