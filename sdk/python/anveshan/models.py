"""Pydantic data models for Project Anveshan contracts."""

from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


SessionStatus = Literal[
    "queued", "running", "paused", "completed", "failed", "cancelled"
]

SourceKind = Literal[
    "arxiv", "semantic-scholar", "pubmed", "crossref", "brave", "web"
]

EventType = Literal[
    "status", "plan", "search", "finding", "critic", "synthesize", "error"
]


class AnveshanModel(BaseModel):
    """Base model that ignores unknown/extra fields for forward/backward compatibility."""
    model_config = {"extra": "ignore"}


class Source(AnveshanModel):
    url: str
    title: str
    snippet: Optional[str] = None
    kind: SourceKind = "web"
    year: Optional[int] = None
    venue: Optional[str] = None
    authors: Optional[List[str]] = None


class Finding(AnveshanModel):
    id: str
    createdAt: str
    agent: str = "search"
    claim: str
    summary: str
    source: Source
    confidence: float = 0.5
    tags: List[str] = Field(default_factory=list)


class Claim(AnveshanModel):
    id: str
    statement: str
    confidence: float = 0.5
    sourceId: Optional[str] = None
    clusterId: Optional[str] = None
    evidence: Optional[str] = None
    relevance: Optional[float] = None
    clusterLabel: Optional[str] = None


class Critique(AnveshanModel):
    id: Optional[str] = None
    round: Optional[int] = None
    createdAt: Optional[str] = None
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    missingAngles: List[str] = Field(default_factory=list)
    nextQueries: List[str] = Field(default_factory=list)


class ResearchTask(AnveshanModel):
    id: str
    type: str = "search"
    query: str
    reason: Optional[str] = None
    done: bool = False
    sourceIds: List[str] = Field(default_factory=list)


class ResearchPlan(AnveshanModel):
    goal: Optional[str] = None
    summary: Optional[str] = None
    questions: List[str] = Field(default_factory=list)
    tasks: List[ResearchTask] = Field(default_factory=list)
    updatedAt: Optional[str] = None
    round: Optional[int] = None


class RunMetrics(AnveshanModel):
    durationMs: int = 0
    rounds: int = 0
    queries: int = 0
    sources: int = 0
    uniqueSources: int = 0
    claimsExtracted: int = 0
    duplicateClaims: int = 0
    highConfidenceClaims: int = 0
    criticIssues: int = 0
    researchGaps: int = 0
    contradictions: int = 0
    llmCalls: int = 0
    llmFailures: int = 0
    llmRetries: int = 0
    modelsUsed: List[str] = Field(default_factory=list)


class SessionMeta(AnveshanModel):
    id: str
    goal: str
    status: SessionStatus
    createdAt: str
    updatedAt: str
    model: str
    roundsCompleted: int = 0
    findingCount: int = 0
    claimCount: int = 0
    error: Optional[str] = None
    metrics: Optional[RunMetrics] = None


class SessionEvent(AnveshanModel):
    type: EventType
    agent: str
    message: str
    data: Optional[Any] = None
    ts: str


class SessionSnapshot(AnveshanModel):
    meta: SessionMeta
    plan: Optional[ResearchPlan] = None
    findings: List[Finding] = Field(default_factory=list)
    critiques: List[Critique] = Field(default_factory=list)
    claims: List[Claim] = Field(default_factory=list)
    reportMarkdown: Optional[str] = None


class LLMHealth(AnveshanModel):
    ok: bool
    model: Optional[str] = None
    detail: Optional[str] = None


class HealthStatus(AnveshanModel):
    ok: bool
    llm: Optional[LLMHealth] = None
    version: str


class ResearchReport(AnveshanModel):
    """High-level object returned by client.research()."""
    session_id: str
    goal: str
    markdown: str
    sources: List[Source] = Field(default_factory=list)
    claims: List[Claim] = Field(default_factory=list)
    rounds_completed: int = 0
    duration_seconds: float = 0.0
    metrics: Optional[RunMetrics] = None

    def __str__(self) -> str:
        return self.markdown
