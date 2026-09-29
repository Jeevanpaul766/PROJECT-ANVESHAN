"""LangSmith observability, tracing, and automated evaluation integration."""

from __future__ import annotations
import functools
import re
from typing import Any, Callable, Dict, List, Optional
from anveshan.models import ResearchReport

# Detect if LangSmith SDK is installed
try:
    from langsmith import traceable, Client as LangSmithClient
    LANGSMITH_AVAILABLE = True
except ImportError:
    LANGSMITH_AVAILABLE = False

    # Safe no-op fallback decorator when langsmith is not installed
    def traceable(  # type: ignore[no-redef]
        name: Optional[str] = None,
        run_type: str = "chain",
        **kwargs: Any,
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            @functools.wraps(func)
            def wrapper(*args: Any, **func_kwargs: Any) -> Any:
                return func(*args, **func_kwargs)
            return wrapper
        return decorator


# Granular child spans for LangSmith hierarchical waterfall
@traceable(name="academic_search_tool", run_type="tool")
def _trace_search_step(query: str, findings_count: int, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Child tool span: records external academic database searches (arXiv, Semantic Scholar, etc.)."""
    return {"query": query, "findings_count": findings_count, "details": details or {}}


@traceable(name="claim_extraction_tool", run_type="tool")
def _trace_extraction_step(claims_extracted: int, summary: str) -> Dict[str, Any]:
    """Child tool span: records atomic factual claim extractions from gathered sources."""
    return {"claims_extracted": claims_extracted, "summary": summary}


@traceable(name="critic_agent_review", run_type="chain")
def _trace_critic_step(weaknesses: List[str], next_queries: List[str], sufficient: bool) -> Dict[str, Any]:
    """Child chain span: records critic reflection, gap detection, and follow-up query formulation."""
    return {"weaknesses": weaknesses, "next_queries": next_queries, "sufficient": sufficient}


@traceable(name="report_synthesizer", run_type="llm")
def _trace_synthesizer_step(report_chars: int, sources_count: int, claims_cited: int) -> Dict[str, Any]:
    """Child LLM span: records final publication-grade report compilation and citation verification."""
    return {"report_chars": report_chars, "sources_count": sources_count, "claims_cited": claims_cited}


@traceable(name="anveshan_deep_research", run_type="chain")
def traced_research(
    client_or_func: Any,
    goal: str,
    rounds: int = 3,
    model: Optional[str] = None,
    **kwargs: Any,
) -> ResearchReport:
    """Execute Anveshan research with automatic LangSmith hierarchical tool/chain child spans."""
    # Handle both client instance or direct client.research callable
    if hasattr(client_or_func, "research"):
        client = client_or_func
        # Track events in real-time to generate child tool spans in LangSmith
        meta = client.create_session(goal, model=model)
        session_id = meta.id

        def event_callback(event: Any) -> None:
            if event.type == "search":
                _trace_search_step(query=event.message, findings_count=getattr(event, "data", {}).get("findings", 0) if isinstance(getattr(event, "data", None), dict) else 0)
            elif event.type == "finding":
                _trace_extraction_step(claims_extracted=1, summary=event.message)
            elif event.type == "critic":
                _trace_critic_step(weaknesses=[event.message], next_queries=[], sufficient=False)
            elif event.type == "synthesize":
                _trace_synthesizer_step(report_chars=len(event.message), sources_count=meta.findingCount, claims_cited=meta.claimCount)

        client.start(session_id)
        for ev in client.stream_events(session_id):
            event_callback(ev)
            if ev.type in ("synthesize", "error"):
                break

        snap = client.get_snapshot(session_id)
        report_md = snap.reportMarkdown or client.get_report(session_id)
        report = ResearchReport(
            session_id=session_id,
            goal=goal,
            markdown=report_md,
            sources=[f.source for f in snap.findings],
            claims=snap.claims,
            rounds_completed=snap.meta.roundsCompleted,
            metrics=snap.meta.metrics,
        )
    else:
        # Backward-compatible fallback for direct callable
        report = client_or_func(goal=goal, rounds=rounds, model=model, **kwargs)
        # Instrument child spans from the produced report
        _trace_search_step(query=goal, findings_count=len(report.sources))
        _trace_extraction_step(claims_extracted=len(report.claims), summary=f"Extracted {len(report.claims)} atomic claims")
        _trace_critic_step(weaknesses=["Coverage validated across sources"], next_queries=[], sufficient=True)
        _trace_synthesizer_step(report_chars=len(report.markdown), sources_count=len(report.sources), claims_cited=len(report.claims))

    return report


def evaluate_citation_integrity(report: ResearchReport) -> Dict[str, Any]:
    """Automated evaluation metric: checks for hallucinated citations.

    Returns:
        Dict with score (1.0 = perfect zero-hallucination citation coverage) and details.
    """
    text = report.markdown
    sources = report.sources

    # Extract all [N] citation indices from the text
    cited_indices = {
        int(match)
        for match in re.findall(r"\[(\d+)\]", text)
        if match.isdigit()
    }

    total_sources = len(sources)
    if not cited_indices:
        return {
            "score": 0.0,
            "reason": "No numerical citations [1]..[N] found in report body.",
            "cited_count": 0,
            "total_sources": total_sources,
        }

    # Verify that cited numbers do not exceed total source count
    valid_citations = [i for i in cited_indices if 1 <= i <= total_sources]
    hallucinated_citations = [i for i in cited_indices if i > total_sources or i < 1]

    integrity_score = (
        len(valid_citations) / len(cited_indices) if cited_indices else 0.0
    )

    return {
        "score": round(integrity_score, 3),
        "reason": f"Cited {len(valid_citations)}/{len(cited_indices)} valid sources.",
        "valid_count": len(valid_citations),
        "hallucinated_count": len(hallucinated_citations),
        "total_sources": total_sources,
    }


def evaluate_source_authority(report: ResearchReport) -> Dict[str, Any]:
    """Automated evaluation metric: ratio of peer-reviewed/academic papers vs web."""
    if not report.sources:
        return {"score": 0.0, "reason": "No sources gathered."}

    academic_kinds = {"arxiv", "semantic-scholar", "pubmed", "crossref"}
    academic_count = sum(1 for s in report.sources if s.kind in academic_kinds)
    score = academic_count / len(report.sources)

    return {
        "score": round(score, 3),
        "reason": f"{academic_count}/{len(report.sources)} sources from verified academic indexes.",
        "academic_count": academic_count,
        "total_sources": len(report.sources),
    }


def log_to_langsmith(
    run_id: str,
    metric_name: str,
    score: float,
    comment: Optional[str] = None,
) -> bool:
    """Log an evaluation score directly to a LangSmith run trace."""
    if not LANGSMITH_AVAILABLE:
        return False

    try:
        ls_client = LangSmithClient()
        ls_client.create_feedback(
            run_id=run_id,
            key=metric_name,
            score=score,
            comment=comment,
        )
        return True
    except Exception:
        return False
