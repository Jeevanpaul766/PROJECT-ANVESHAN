/**
 * Token budget management for multi-provider LLM router.
 *
 * Three capabilities:
 *   1. estimateTokens(messages)   — fast heuristic token count
 *   2. pruneMessages(messages, budget) — trim history to fit a provider's budget
 *   3. RateLimiter                — per-provider sliding-window TPM pacer
 *
 * No external dependencies. Uses only built-in Node APIs.
 */

import type { ChatMessage } from "./types.js";

// ---------------------------------------------------------------------------
// 1. Token estimation (heuristic — chars ÷ 3.5)
// ---------------------------------------------------------------------------

/**
 * Estimate the number of tokens in a set of messages.
 * Uses the ~3.5 chars/token heuristic which is conservative enough
 * for budget control without needing a full tokenizer.
 */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    // Role overhead (~4 tokens per message for ChatML framing)
    chars += 14;
    chars += m.content.length;
  }
  return Math.ceil(chars / 3.5);
}

/**
 * Estimate tokens for a single string.
 */
export function estimateStringTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ---------------------------------------------------------------------------
// 2. Message pruning
// ---------------------------------------------------------------------------

/**
 * Prune a message array to fit within a token budget.
 *
 * Strategy:
 *   - Always keep the system message(s) (first priority)
 *   - Always keep the last user message (the actual request)
 *   - Drop middle messages oldest-first
 *   - If still over budget, truncate the last user message content
 *
 * Returns a new array (never mutates the input).
 */
export function pruneMessages(
  messages: ChatMessage[],
  maxTokens: number,
): ChatMessage[] {
  if (messages.length === 0) return [];

  const currentTokens = estimateTokens(messages);
  if (currentTokens <= maxTokens) return messages;

  // Separate system messages and conversation messages
  const systemMsgs = messages.filter((m) => m.role === "system");
  const convMsgs = messages.filter((m) => m.role !== "system");

  if (convMsgs.length === 0) {
    // Only system messages — truncate content if needed
    return truncateSystemMessages(systemMsgs, maxTokens);
  }

  // Always keep the last user message
  const lastMsg = convMsgs[convMsgs.length - 1];
  const middleMsgs = convMsgs.slice(0, -1);

  // Budget available for middle messages after system + last message
  const systemTokens = estimateTokens(systemMsgs);
  const lastMsgTokens = estimateTokens([lastMsg]);
  const reservedTokens = systemTokens + lastMsgTokens;

  if (reservedTokens >= maxTokens) {
    // System + last message alone exceed budget — truncate last message
    const availableForLast = Math.max(100, maxTokens - systemTokens);
    const truncatedLast = truncateMessage(lastMsg, availableForLast);
    console.warn(
      `[tokenBudget] truncated last message: ${estimateTokens([lastMsg])} → ${estimateTokens([truncatedLast])} tokens`,
    );
    return [...systemMsgs, truncatedLast];
  }

  // Drop middle messages oldest-first until we fit
  const availableForMiddle = maxTokens - reservedTokens;
  const keptMiddle: ChatMessage[] = [];
  let middleTokens = 0;
  let droppedCount = 0;

  // Walk backwards (keep newest middle messages first)
  for (let i = middleMsgs.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens([middleMsgs[i]]);
    if (middleTokens + msgTokens <= availableForMiddle) {
      keptMiddle.unshift(middleMsgs[i]);
      middleTokens += msgTokens;
    } else {
      droppedCount++;
    }
  }

  if (droppedCount > 0) {
    // Insert a summary marker so the model knows history was pruned
    const summaryMsg: ChatMessage = {
      role: "system",
      content: `[Context note: ${droppedCount} earlier message(s) were trimmed to fit the token budget. The conversation continues from the most recent exchanges.]`,
    };
    console.warn(
      `[tokenBudget] pruned ${droppedCount} middle message(s), kept ${keptMiddle.length}`,
    );
    return [...systemMsgs, summaryMsg, ...keptMiddle, lastMsg];
  }

  return [...systemMsgs, ...keptMiddle, lastMsg];
}

// ---------------------------------------------------------------------------
// Truncation helpers
// ---------------------------------------------------------------------------

function truncateMessage(msg: ChatMessage, maxTokens: number): ChatMessage {
  const maxChars = Math.floor(maxTokens * 3.5) - 14; // subtract role overhead
  if (msg.content.length <= maxChars) return msg;
  return {
    ...msg,
    content: msg.content.slice(0, maxChars) + "\n\n[...content truncated to fit token budget]",
  };
}

function truncateSystemMessages(
  msgs: ChatMessage[],
  maxTokens: number,
): ChatMessage[] {
  const totalTokens = estimateTokens(msgs);
  if (totalTokens <= maxTokens) return msgs;

  // Truncate each system message proportionally
  const ratio = maxTokens / totalTokens;
  return msgs.map((m) => {
    const maxChars = Math.floor(m.content.length * ratio * 0.9); // 10% safety margin
    if (m.content.length <= maxChars) return m;
    return {
      ...m,
      content: m.content.slice(0, maxChars) + "\n[...truncated]",
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Per-provider rate limiter (sliding window)
// ---------------------------------------------------------------------------

interface RateLimitConfig {
  /** Maximum tokens per minute for this provider. */
  maxTPM: number;
  /** Minimum milliseconds between consecutive calls. */
  minIntervalMs: number;
}

interface TokenRecord {
  timestamp: number;
  tokens: number;
}

/**
 * Sliding-window rate limiter.
 *
 * Tracks tokens consumed per provider over a 60-second window.
 * Callers should `await limiter.waitIfNeeded(provider, tokens)` before
 * making an API call.
 */
class RateLimiterImpl {
  private windows = new Map<string, TokenRecord[]>();
  private lastCall = new Map<string, number>();
  private configs = new Map<string, RateLimitConfig>();

  configure(provider: string, config: RateLimitConfig): void {
    this.configs.set(provider, config);
  }

  /**
   * Wait (if necessary) to stay within the provider's rate limit.
   * Returns the number of milliseconds we actually waited.
   */
  async waitIfNeeded(provider: string, estimatedTokens: number): Promise<number> {
    const config = this.configs.get(provider);
    if (!config) return 0;

    let totalWait = 0;

    // 1. Minimum inter-call spacing
    const last = this.lastCall.get(provider) ?? 0;
    const sinceLast = Date.now() - last;
    if (sinceLast < config.minIntervalMs) {
      const delay = config.minIntervalMs - sinceLast;
      await sleep(delay);
      totalWait += delay;
    }

    // 2. Sliding-window TPM check
    const now = Date.now();
    const windowStart = now - 60_000;
    const records = this.windows.get(provider) ?? [];

    // Evict old records
    const active = records.filter((r) => r.timestamp >= windowStart);
    const windowTokens = active.reduce((sum, r) => sum + r.tokens, 0);

    if (windowTokens + estimatedTokens > config.maxTPM) {
      // Wait until the oldest record falls out of the window
      const oldestInWindow = active.length > 0 ? active[0].timestamp : now;
      const waitUntil = oldestInWindow + 60_000 - now + 500; // 500ms buffer
      const delay = Math.max(1_000, Math.min(waitUntil, 30_000)); // cap at 30s
      console.warn(
        `[rateLimiter] TPM limit for ${provider}: ${windowTokens}/${config.maxTPM} tokens used. ` +
          `Waiting ${delay}ms before next call.`,
      );
      await sleep(delay);
      totalWait += delay;
    }

    // Record this call
    active.push({ timestamp: Date.now(), tokens: estimatedTokens });
    this.windows.set(provider, active);
    this.lastCall.set(provider, Date.now());

    return totalWait;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Singleton
export const rateLimiter = new RateLimiterImpl();

// Default configs — configured from config.ts at startup
export function configureRateLimits(limits: Record<string, { maxTPM: number; minIntervalMs: number }>): void {
  for (const [provider, config] of Object.entries(limits)) {
    rateLimiter.configure(provider, config);
  }
}
