#!/usr/bin/env python3
"""Project Anveshan — LangSmith Tracing & Automated Evaluation Benchmark.

Demonstrates:
  1. Automated hierarchical span tracing into LangSmith.
  2. Evaluating research reports for citation fidelity (no hallucinated sources).
  3. Evaluating academic source authority ratio.
  4. Logging evaluation metrics and feedback directly to LangSmith traces.

Usage:
    export LANGCHAIN_TRACING_V2="true"
    export LANGCHAIN_API_KEY="your-api-key"
    export LANGCHAIN_PROJECT="anveshan-deep-research"
    python 04_langsmith_evaluation.py
"""

import os
from anveshan import AnveshanClient
from anveshan.integrations.langsmith import (
    evaluate_citation_integrity,
    evaluate_source_authority,
    log_to_langsmith,
    traced_research,
)


def run_evaluation_benchmark() -> None:
    print("=" * 60)
    print("ANVESHAN + LANGSMITH EVALUATION SUITE")
    print("=" * 60)

    is_langsmith_active = (
        os.environ.get("LANGCHAIN_TRACING_V2") == "true"
        and bool(os.environ.get("LANGCHAIN_API_KEY"))
    )

    if not is_langsmith_active:
        print("[Notice] LANGCHAIN_API_KEY or LANGCHAIN_TRACING_V2 not set.")
        print("Running in local evaluation mode (metrics calculated without cloud upload).\n")
    else:
        project = os.environ.get("LANGCHAIN_PROJECT", "anveshan-deep-research")
        print(f"[Active] Tracing runs to LangSmith project: '{project}'\n")

    client = AnveshanClient()

    # 1. Execute research wrapped in LangSmith @traceable span
    goal = "Quantum error correction surface codes 2024"
    print(f"Running research benchmark on: '{goal}'...")

    report = traced_research(
        client.research,
        goal=goal,
        rounds=1,
        model="ollama:qwen2.5:7b",
        stream=False,
    )

    print(f"\nReport generated: {len(report.markdown)} chars across {len(report.sources)} sources.")

    # 2. Evaluate Citation Integrity (Zero-Hallucination Check)
    citation_eval = evaluate_citation_integrity(report)
    print("\n[Evaluation Metric 1: Citation Integrity]")
    print(f"  Score              : {citation_eval['score'] * 100:.1f}%")
    print(f"  Valid Citations    : {citation_eval.get('valid_count', 0)}")
    print(f"  Hallucinated Count : {citation_eval.get('hallucinated_count', 0)}")
    print(f"  Assessment         : {citation_eval['reason']}")

    # 3. Evaluate Source Authority Ratio
    authority_eval = evaluate_source_authority(report)
    print("\n[Evaluation Metric 2: Academic Authority Ratio]")
    print(f"  Score              : {authority_eval['score'] * 100:.1f}%")
    print(f"  Academic Sources   : {authority_eval.get('academic_count', 0)}/{authority_eval.get('total_sources', 0)}")
    print(f"  Assessment         : {authority_eval['reason']}")

    # 4. Push feedback to LangSmith if configured
    if is_langsmith_active:
        print("\nUploading benchmark scores to LangSmith trace...")
        log_to_langsmith(
            run_id=report.session_id,
            metric_name="citation_integrity",
            score=citation_eval["score"],
            comment=citation_eval["reason"],
        )
        log_to_langsmith(
            run_id=report.session_id,
            metric_name="academic_authority",
            score=authority_eval["score"],
            comment=authority_eval["reason"],
        )
        print("✓ Metrics successfully logged to LangSmith dashboard!")


if __name__ == "__main__":
    run_evaluation_benchmark()
