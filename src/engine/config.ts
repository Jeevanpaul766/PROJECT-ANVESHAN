/**
 * Env and paths for Project Anveshan.
 * Spec: plans/modules/M01-foundation.md
 * Phase 3: multi-provider LLM router — Gemini → Groq → OpenRouter → HuggingFace.
 *          Removed Ollama / local-model dependency.
 */

import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LoopConfig } from "./types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: join(root, ".env") });

export const ROOT_DIR = root;
export const DATA_DIR = join(root, "data", "sessions");

export function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export const SERVER = {
  host: env("ANVESHAN_HOST", "127.0.0.1"),
  port: intEnv("ANVESHAN_PORT", 4747),
};

// ---------------------------------------------------------------------------
// Multi-provider config — Gemini → Groq → OpenRouter → HuggingFace
// ---------------------------------------------------------------------------

export const PROVIDERS = {
  gemini: {
    name: "gemini",
    apiKey: env("GEMINI_API_KEY", ""),
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    model: env("ANVESHAN_GEMINI_MODEL", "gemini-3.6-flash"),
    fastModel: env("ANVESHAN_GEMINI_FAST_MODEL", "gemini-3.6-flash"),
    smartModel: env("ANVESHAN_GEMINI_SMART_MODEL", "gemini-3.6-flash"),
  },
  groq: {
    name: "groq",
    apiKey: env("GROQ_API_KEY", ""),
    baseUrl: "https://api.groq.com/openai/v1",
    model: env("ANVESHAN_GROQ_MODEL", "openai/gpt-oss-120b"),
    fastModel: env("ANVESHAN_GROQ_FAST_MODEL", "openai/gpt-oss-20b"),
    smartModel: env("ANVESHAN_GROQ_SMART_MODEL", "openai/gpt-oss-120b"),
  },
  openrouter: {
    name: "openrouter",
    apiKey: env("OPENROUTER_API_KEY", ""),
    baseUrl: "https://openrouter.ai/api/v1",
    model: env("ANVESHAN_OPENROUTER_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
    fastModel: env("ANVESHAN_OPENROUTER_FAST_MODEL", "liquid/lfm-2.5-2.6b:free"),
    smartModel: env("ANVESHAN_OPENROUTER_SMART_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
  },
  huggingface: {
    name: "huggingface",
    apiKey: env("HUGGINGFACE_API_KEY", ""),
    baseUrl: "https://api-inference.huggingface.co/v1",
    model: env("ANVESHAN_HF_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
    fastModel: env("ANVESHAN_HF_FAST_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
    smartModel: env("ANVESHAN_HF_SMART_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
  },
  ollama: {
    name: "ollama",
    apiKey: "ollama",
    baseUrl: env("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
    model: env("ANVESHAN_OLLAMA_MODEL", "qwen2.5:7b"),
    fastModel: env("ANVESHAN_OLLAMA_FAST_MODEL", "qwen2.5:7b"),
    smartModel: env("ANVESHAN_OLLAMA_SMART_MODEL", "qwen2.5:7b"),
  },
};

// ---------------------------------------------------------------------------
// Per-provider token budgets and rate limits
// ---------------------------------------------------------------------------

/** Max tokens to send per call (input tokens). Prevents prompt bloat. */
export const TOKEN_BUDGETS: Record<string, number> = {
  ollama: 32_000,    // Local Ollama context: 32k tokens, unlimited rate limit
  gemini: 28_000,    // Gemini Flash supports up to 1M context; keep prompts lean anyway
  groq: 6_000,       // Groq free tier
  openrouter: 12_000,
  huggingface: 6_000,
};

/** Rate limit configs per provider to avoid 429 errors. */
export const RATE_LIMITS: Record<string, { maxTPM: number; minIntervalMs: number }> = {
  ollama: { maxTPM: 1_000_000, minIntervalMs: 0 },   // Local: no rate limits
  gemini: { maxTPM: 50_000, minIntervalMs: 500 },    // generous free tier
  groq: { maxTPM: 7_500, minIntervalMs: 2_000 },     // strict TPM limit
  openrouter: { maxTPM: 20_000, minIntervalMs: 1_000 },
  huggingface: { maxTPM: 10_000, minIntervalMs: 1_500 },
};

// ---------------------------------------------------------------------------
// Thin compatibility shim — resolves the first configured provider's values
// so that existing code that reads LLM.model / LLM.baseUrl still compiles.
// ---------------------------------------------------------------------------

function firstConfigured() {
  const order = [PROVIDERS.gemini, PROVIDERS.groq, PROVIDERS.openrouter, PROVIDERS.huggingface];
  return order.find((p) => p.apiKey) ?? PROVIDERS.gemini;
}

export const LLM = {
  get baseUrl() { return firstConfigured().baseUrl; },
  get apiKey()  { return firstConfigured().apiKey; },
  get model()   { return firstConfigured().model; },
  get fastModel() { return firstConfigured().fastModel ?? firstConfigured().model; },
  get smartModel() { return firstConfigured().smartModel ?? firstConfigured().model; },
};

/** Phase 2: resolve a model by role, falling back to the default model. */
export type ModelRole = "fast" | "smart";

export function resolveModel(role: ModelRole, baseModel?: string): string {
  if (baseModel) {
    const trimmed = baseModel.trim();
    // If a specific provider model tag is given (e.g. "ollama:qwen2.5:7b"), preserve it exactly
    if (trimmed.startsWith("ollama:") && trimmed.length > "ollama:".length) {
      return trimmed;
    }
    if (trimmed.startsWith("groq:") && trimmed.length > "groq:".length) {
      return trimmed;
    }
    if (trimmed.startsWith("gemini:") && trimmed.length > "gemini:".length) {
      return trimmed;
    }
    if (trimmed.startsWith("openrouter:") && trimmed.length > "openrouter:".length) {
      return trimmed;
    }
    if (trimmed.startsWith("ollama") || trimmed.startsWith("qwen2.5")) {
      return role === "fast"
        ? `ollama:${PROVIDERS.ollama.fastModel}`
        : `ollama:${PROVIDERS.ollama.smartModel}`;
    }
    if (trimmed.startsWith("groq")) {
      return role === "fast"
        ? `groq:${PROVIDERS.groq.fastModel}`
        : `groq:${PROVIDERS.groq.smartModel}`;
    }
    if (trimmed.startsWith("gemini")) {
      return role === "fast"
        ? `gemini:${PROVIDERS.gemini.fastModel}`
        : `gemini:${PROVIDERS.gemini.smartModel}`;
    }
    if (trimmed.startsWith("openrouter")) {
      return role === "fast"
        ? `openrouter:${PROVIDERS.openrouter.fastModel}`
        : `openrouter:${PROVIDERS.openrouter.smartModel}`;
    }
    return trimmed;
  }

  const p = firstConfigured();
  if (role === "fast" && p.fastModel) return p.fastModel;
  if (role === "smart" && p.smartModel) return p.smartModel;
  return p.model;
}

/** Phase 2: Brave Search API config. */
export const BRAVE = {
  apiKey: env("ANVESHAN_BRAVE_API_KEY", ""),
};

export function loopConfig(): LoopConfig {
  const p = firstConfigured();
  return {
    maxRounds: intEnv("ANVESHAN_MAX_ROUNDS", 5),
    maxFindings: intEnv("ANVESHAN_MAX_FINDINGS", 100),
    maxQueriesPerRound: intEnv("ANVESHAN_MAX_QUERIES_PER_ROUND", 8),
    maxSources: intEnv("ANVESHAN_MAX_SOURCES", 100),
    model: p.model,
    fastModel: p.fastModel ?? p.model,
    smartModel: p.smartModel ?? p.model,
  };
}
