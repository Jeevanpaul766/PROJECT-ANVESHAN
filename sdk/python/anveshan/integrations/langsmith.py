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


@traceable(name="anveshan_deep_research", run_type="chain")
def traced_research(
    client_func: Callable[..., ResearchReport],
    goal: str,
    rounds: int = 3,
    model: Optional[str] = None,
    **kwargs: Any,
) -> ResearchReport:
    """Execute Anveshan research with automatic LangSmith root and metadata logging."""
    report = client_func(goal=goal, rounds=rounds, model=model, **kwargs)
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
