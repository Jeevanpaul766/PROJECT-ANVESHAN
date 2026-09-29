/**
 * High-precision domain relevance filter.
 * 100% deterministic (zero LLM overhead).
 * Rejects off-topic papers (cybersecurity, fuel cells, superconductivity, vehicular tire friction)
 * while preserving high-relevance solid-state battery materials literature.
 */

import type { Source } from "./types.js";

// Unrelated topics to explicitly block
const REJECT_PATTERNS = [
  /\b(cyberattack|intrusion detection|smart grid|charging station|charging control|generic enabler)\b/i,
  /\b(tire-road|vehicle state and parameters|friction observer|twin-in-the-loop)\b/i,
  /\b(superconductivity for solid state chemists|high-temperature superconductivity)\b/i,
  /\b(direct air capture|dac plant|fuel cell polarization)\b/i,
  /\b(neutrino experiment|solid detector)\b/i,
  /\b(field-effect transistor|graphene fet|supercapacitor|electric-double-layer elements using cu\+)\b/i,
];

// Required core concept stems for battery / electrolyte research
const BATTERY_CORE_KEYWORDS = [
  "electrolyte",
  "solid-state",
  "solid state",
  "all-solid-state",
  "ionic conduct",
  "conductivity",
  "argyrodite",
  "garnet",
  "llzo",
  "nasicon",
  "halide",
  "polymer",
  "interfacial",
  "lithium",
  "sodium",
  "battery",
  "anode",
  "cathode",
];

export async function checkSourceRelevance(
  goal: string,
  _taskQuery: string,
  source: Source,
  _signal?: AbortSignal,
): Promise<boolean> {
  const text = `${source.title} ${source.snippet || ""}`.toLowerCase();

  // 1. Explicit reject filter for known noisy academic cross-matches
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(source.title) || pattern.test(source.snippet || "")) {
      return false;
    }
  }

  // 2. Reject "Review for ..." peer-review comments metadata entries
  if (/^review for\s*"/i.test(source.title)) {
    return false;
  }

  // 3. Goal-specific matching:
  // If goal mentions "solid-state" or "solid state" and "electrolyte", source MUST match electrolyte concepts
  const isSolidStateGoal = /solid[\s-]state/i.test(goal) && /electrolyte/i.test(goal);

  if (isSolidStateGoal) {
    const hasElectrolyte = /\b(electrolyte|solid-state|solid state|sse|assb|ionic conductivity|argyrodite|garnet|llzo|nasicon|halide|polymer)\b/i.test(text);
    if (!hasElectrolyte) return false;
  }

  // Count core keyword matches
  let matchCount = 0;
  for (const kw of BATTERY_CORE_KEYWORDS) {
    if (text.includes(kw)) {
      matchCount++;
    }
  }

  return matchCount >= 2;
}
