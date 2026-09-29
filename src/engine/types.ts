/**
 * Shared data contracts for Project Anveshan.
 * Spec: plans/modules/M00-contracts.md
 * Phase 2: added Claim, Citation, Contradiction, ResearchGap, SourceScore, RunMetrics.
 */

// ---------------------------------------------------------------------------
// Source kinds — extensible without architectural rewrite
// ---------------------------------------------------------------------------

export type SourceKind =
  | "arxiv"
  | "semantic-scholar"
  | "web"
  | "brave"
  | "pubmed"
  | "crossref";

// ---------------------------------------------------------------------------
// Agent names and session lifecycle
// ---------------------------------------------------------------------------

export type AgentName =
  | "orchestrator"
  | "search"
  | "critic"
  | "synthesizer"
  | "system";

export type SessionStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Core research objects (M00)
// ---------------------------------------------------------------------------

export interface Source {
  kind: SourceKind;
  title: string;
  url: string;
  authors?: string[];
  year?: number;
  venue?: string;
  snippet?: string;
}

export interface Finding {
  id: string;
  createdAt: string;
  agent: AgentName;
  claim: string;
  summary: string;
  source: Source;
  confidence: number;
  tags: string[];
}

export interface ResearchTask {
  id: string;
  type: "search" | "read" | "critique" | "synthesize";
  query: string;
  reason: string;
  done: boolean;
}

export interface ResearchPlan {
  goal: string;
  summary: string;
  questions: string[];
  tasks: ResearchTask[];
  updatedAt: string;
}

export interface Critique {
  createdAt: string;
  strengths: string[];
  weaknesses: string[];
  missingAngles: string[];
  nextQueries: string[];
}

export interface SessionEvent {
  ts: string;
  type:
    | "status"
    | "plan"
    | "search"
    | "finding"
    | "critic"
    | "synthesize"
    | "error";
  agent: AgentName;
  message: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Phase 2 — Claim extraction
// ---------------------------------------------------------------------------

/**
 * An atomic, LLM-extracted claim from a single source.
 * Retains the source reference so citations can be built precisely.
 */
export interface Claim {
  id: string;
  /** Corresponds to Finding.id */
  sourceId: string;
  /** One-sentence factual statement extracted from the source */
  statement: string;
  /** Verbatim or close-paraphrase quote from source text supporting the claim */
  evidence: string;
  /** 0–1: model confidence that the extraction is faithful */
  confidence: number;
  /** 0–1: relevance of this claim to the research goal */
  relevance: number;
  /** 0–1: quality score assigned by quality.ts */
  quality: number;
  /** Deduplication cluster root claim ID, or null if unclustered */
  clusterId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Phase 2 — Citation mapping
// ---------------------------------------------------------------------------

/**
 * Maps a Claim to its source with an ordered citation index.
 * Used by the Synthesizer to build the ## Sources section.
 */
export interface Citation {
  claimId: string;
  /** Corresponds to Finding.id */
  sourceId: string;
  sourceUrl: string;
  citationIndex: number;
  claimStatement: string;
}

// ---------------------------------------------------------------------------
// Phase 2 — Contradiction detection
// ---------------------------------------------------------------------------

/**
 * A pair of claims that conflict with each other.
 * Detected by the Critic using the SMART model.
 */
export interface Contradiction {
  id: string;
  claimAId: string;
  claimBId: string;
  explanation: string;
  /** 0–1: 1 = direct logical contradiction, 0 = minor tension */
  severity: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Phase 2 — Research gap detection
// ---------------------------------------------------------------------------

export interface ResearchGap {
  id: string;
  description: string;
  /** 0–1: how important it is to fill this gap */
  importance: number;
  suggestedQuery: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Phase 2 — Source quality scoring
// ---------------------------------------------------------------------------

/** All values normalized to 0–1. */
export interface SourceScore {
  authority: number;
  relevance: number;
  recency: number;
  evidenceQuality: number;
  overall: number;
}

// ---------------------------------------------------------------------------
// Phase 2 — Run-level metrics (observability)
// ---------------------------------------------------------------------------

export interface RunMetrics {
  durationMs: number;
  rounds: number;
  queries: number;
  sources: number;
  uniqueSources: number;
  claimsExtracted: number;
  duplicateClaims: number;
  highConfidenceClaims: number;
  criticIssues: number;
  researchGaps: number;
  contradictions: number;
  llmCalls: number;
  llmFailures: number;
  llmRetries: number;
  modelsUsed: string[];
}

// ---------------------------------------------------------------------------
// Session (M04) — updated to carry Phase 2 data (all new fields optional)
// ---------------------------------------------------------------------------

export interface SessionMeta {
  id: string;
  goal: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  model: string;
  roundsCompleted: number;
  findingCount: number;
  error?: string;
  /** Phase 2: populated after each round completes */
  claimCount?: number;
  /** Phase 2: populated when session completes */
  metrics?: Partial<RunMetrics>;
}

export interface SessionSnapshot {
  meta: SessionMeta;
  plan: ResearchPlan | null;
  findings: Finding[];
  critiques: Critique[];
  events: SessionEvent[];
  reportMarkdown: string | null;
  /** Phase 2: LLM-extracted atomic claims (undefined for old sessions) */
  claims?: Claim[];
}

// ---------------------------------------------------------------------------
// Loop configuration (M09) — extended for Phase 2
// ---------------------------------------------------------------------------

export interface LoopConfig {
  maxRounds: number;
  maxFindings: number;
  /** Phase 2: max search queries dispatched per round */
  maxQueriesPerRound: number;
  /** Phase 2: hard cap on total unique sources collected */
  maxSources: number;
  model: string;
  /** Phase 2: model used for fast/cheap tasks */
  fastModel: string;
  /** Phase 2: model used for complex reasoning */
  smartModel: string;
}

