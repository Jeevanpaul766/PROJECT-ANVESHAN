# Project Anveshan Python SDK 🧭

[![Python: >=3.9](https://img.shields.io/badge/python-%3E%3D3.9-blue.svg)](pyproject.toml)
[![Pydantic: v2](https://img.shields.io/badge/pydantic-v2-green.svg)](https://docs.pydantic.dev/)
[![LangChain: Compatible](https://img.shields.io/badge/LangChain-Integration-blueviolet.svg)](https://www.langchain.com/)
[![LangGraph: Compatible](https://img.shields.io/badge/LangGraph-Integration-orange.svg)](https://www.langchain.com/langgraph)
[![LangSmith: Tracing](https://img.shields.io/badge/LangSmith-Observability-purple.svg)](https://www.langchain.com/langsmith)

The official Python client, **LangChain Tool**, and **LangGraph Node** for **Project Anveshan** — an open Deep Research Operating System for long-horizon, autonomous, and cited technical investigations.

---

## Installation

Install directly from the local workspace:

```bash
# Core client only (httpx + pydantic)
pip install -e ./sdk/python

# With LangChain, LangGraph & LangSmith integrations
pip install -e "./sdk/python[langchain]"
```

---

## 1. Quickstart (Python Client)

Run autonomous deep research in 5 lines of Python:

```python
from anveshan import AnveshanClient

client = AnveshanClient("http://127.0.0.1:4747")

# Executes multi-round research, streams live events, and returns cited report
report = client.research(
    goal="Quantum error correction surface codes 2024",
    rounds=2,
    model="ollama:qwen2.5:7b",  # Lightweight model (keeps Mac cool & quiet)
    stream=True,
)

print(report.markdown)
print(f"Discovered {len(report.sources)} papers across {report.rounds_completed} rounds.")
```

---

## 2. LangChain Integration (`BaseTool`)

Drop Anveshan directly into any LangChain agent or tool-calling model:

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_react_agent
from anveshan.integrations.langchain import AnveshanDeepResearchTool

# Initialize Anveshan tool
tools = [AnveshanDeepResearchTool(api_url="http://127.0.0.1:4747")]

# Pass to your LangChain agent
llm = ChatOpenAI(model="gpt-4o")
# The LLM calls Anveshan when it needs deep, multi-source academic research!
```

---

## 3. LangGraph Integration (`StateGraph`)

Use Anveshan as a dedicated research node in an enterprise multi-agent state graph:

```python
from langgraph.graph import StateGraph, START, END
from anveshan.integrations.langgraph import AnveshanResearchState, create_anveshan_node

# 1. Initialize StateGraph
builder = StateGraph(AnveshanResearchState)

# 2. Add Anveshan as a node
builder.add_node("deep_research", create_anveshan_node(api_url="http://127.0.0.1:4747", stream=True))

# 3. Connect transitions
builder.add_edge(START, "deep_research")
builder.add_edge("deep_research", END)

# 4. Compile and run
app = builder.compile()
result = app.invoke({"goal": "Perovskite solar cell degradation mechanisms"})

print(result["research_report"])
print(f"Sources gathered: {len(result['sources'])}")
```

---

## 4. LangSmith Observability & Quality Evaluation

### Automated Span Tracing
Set your LangSmith credentials in your environment:
```bash
export LANGCHAIN_TRACING_V2="true"
export LANGCHAIN_API_KEY="your-api-key"
export LANGCHAIN_PROJECT="anveshan-deep-research"
```

Every research run automatically logs:
* **Root Run (`AnveshanDeepResearch`)**: Goal, total duration, final report.
* **Child Spans**: Orchestrator planning, search query execution, evidence extraction, critic review, synthesizer generation.
* **Run Metadata**: Number of sources, claims extracted, model used, and latency.

### Automated Evaluation Suite
Run benchmark quality evaluation on generated reports:

```python
from anveshan import AnveshanClient
from anveshan.integrations.langsmith import (
    evaluate_citation_integrity,
    evaluate_source_authority,
    log_to_langsmith,
)

client = AnveshanClient()
report = client.research("Quantum error correction surface codes 2024", rounds=1)

# Check for hallucinated citations (guarantees all [1]..[N] map to real sources)
citation_score = evaluate_citation_integrity(report)
print(f"Citation Integrity: {citation_score['score'] * 100}%")

# Check ratio of peer-reviewed academic papers vs web
authority_score = evaluate_source_authority(report)
print(f"Academic Authority Ratio: {authority_score['score'] * 100}%")

# Push scores to LangSmith dashboard
log_to_langsmith(report.session_id, "citation_integrity", citation_score["score"])
```

---

## Example Scripts

Review ready-to-run examples in [examples/](examples/):
* `01_quickstart.py`: Synchronous end-to-end research execution.
* `02_streaming_events.py`: Custom callback listener for real-time SSE telemetry.
* `03_langgraph_pipeline.py`: Full LangGraph StateGraph agent pipeline.
* `04_langsmith_evaluation.py`: Automated benchmarking and evaluation scoring.

---

## Resume & Portfolio Talking Points 💼

> **Project Anveshan — Deep Research OS & Python Ecosystem**
> - *Architected a local-first Deep Research OS (TypeScript/Node.js) featuring multi-agent DAG planning, evidence extraction, contradiction detection, and citation provenance across academic databases (arXiv, Semantic Scholar).*
> - *Engineered a Python SDK (`anveshan`) with a native **LangChain tool** and **LangGraph node**, allowing multi-agent pipelines to delegate long-horizon investigations to the autonomous engine.*
> - *Integrated **LangSmith tracing and evaluation suites**, capturing hierarchical multi-round execution traces, latency metrics, and automated hallucination/citation benchmarks.*
