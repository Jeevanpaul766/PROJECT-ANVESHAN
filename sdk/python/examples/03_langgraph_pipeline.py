#!/usr/bin/env python3
"""Project Anveshan — LangGraph Multi-Agent Workflow Example.

Demonstrates integrating Project Anveshan as a deep research node
in an enterprise LangGraph StateGraph pipeline.

Requirements:
    pip install "anveshan[langchain]"
"""

from typing import Any, Dict, TypedDict
from anveshan.integrations.langgraph import AnveshanResearchState, create_anveshan_node

try:
    from langgraph.graph import StateGraph, START, END
    LANGGRAPH_INSTALLED = True
except ImportError:
    LANGGRAPH_INSTALLED = False


class PipelineState(TypedDict, total=False):
    """Workflow state passed between nodes."""
    raw_prompt: str
    goal: str
    research_report: str
    sources: list
    claims: list
    executive_brief: str


def query_refiner_node(state: PipelineState) -> Dict[str, Any]:
    """Node 1: Refines user's raw prompt into an academic research goal."""
    raw = state.get("raw_prompt", "")
    refined_goal = f"{raw} technical benchmarks and state of the art"
    print(f"\n[Node 1: Query Refiner] Refined '{raw}' -> '{refined_goal}'")
    return {"goal": refined_goal}


def executive_brief_node(state: PipelineState) -> Dict[str, Any]:
    """Node 3: Distills full deep research report into an executive brief."""
    report = state.get("research_report", "")
    sources = state.get("sources", [])

    # Extract first section as brief
    brief = (
        f"### Executive Summary Brief\n"
        f"- Research conducted across {len(sources)} verified papers.\n"
        f"- Full report available ({len(report)} characters).\n"
    )
    print("\n[Node 3: Executive Brief] Synthesis complete.")
    return {"executive_brief": brief}


def run_pipeline() -> None:
    if not LANGGRAPH_INSTALLED:
        print("LangGraph is not installed. To run this example, install with:")
        print("  pip install 'anveshan[langchain]'")
        print("\nDemonstrating mock graph execution path:")
        print("  START -> query_refiner -> anveshan_deep_research -> executive_brief -> END")
        return

    # 1. Initialize LangGraph StateGraph
    workflow = StateGraph(PipelineState)

    # 2. Add nodes
    workflow.add_node("refine_query", query_refiner_node)
    # The Anveshan deep research node:
    workflow.add_node("deep_research", create_anveshan_node(api_url="http://127.0.0.1:4747", stream=True))
    workflow.add_node("executive_brief", executive_brief_node)

    # 3. Define transitions
    workflow.add_edge(START, "refine_query")
    workflow.add_edge("refine_query", "deep_research")
    workflow.add_edge("deep_research", "executive_brief")
    workflow.add_edge("executive_brief", END)

    # 4. Compile the multi-agent graph
    app = workflow.compile()

    # 5. Run the graph
    print("Executing LangGraph pipeline with Project Anveshan deep research node...")
    inputs: PipelineState = {
        "raw_prompt": "Quantum error correction surface codes 2024",
    }

    final_state = app.invoke(inputs)

    print("\n" + "=" * 60)
    print("LANGGRAPH WORKFLOW OUTPUT")
    print("=" * 60)
    print(final_state.get("executive_brief"))
    print(f"Discovered {len(final_state.get('sources', []))} sources.")


if __name__ == "__main__":
    run_pipeline()
