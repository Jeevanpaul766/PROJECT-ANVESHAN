# Project Anveshan 🧭

> **Open Deep Research Operating System**  
> Autonomous, long-horizon investigation with rigorous source provenance, iterative critical review, and cited synthesis.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-green.svg)](package.json)
[![Python: >=3.9](https://img.shields.io/badge/python-%3E%3D3.9-blue.svg)](sdk/python/pyproject.toml)
[![TypeScript: 5.8](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](tsconfig.json)
[![LangGraph: Ready](https://img.shields.io/badge/LangGraph-Integration-orange.svg)](sdk/python/README.md)

---

## What is Anveshan?

**Project Anveshan** is a local-first, free-first **Deep Research OS** engineered for researchers, scientists, and engineers. Given an ambitious research query, Anveshan orchestrates specialized agents to plan multi-angle investigations, query academic databases and the live web, extract and cross-verify atomic claims, detect logical contradictions, and synthesize extensive, numbered-source reports.

Built around the core formula from the product specification:
$$\text{Agent} = \text{Model} + \text{Harness} + \text{Skills} + \text{Memory} + \text{Domain Knowledge}$$

Anveshan runs autonomously for extended periods (30–60 minutes per investigation) without losing state, allowing sessions to be paused, resumed, and inspected at every step.

---

## Key Features

- **Multi-Source Ingestion**: Parallel querying across **arXiv**, **Semantic Scholar**, **CrossRef**, and live web search backends with automatic deduplication.
- **Evidence Extraction & Deduplication**: Breaks raw sources into verifiable atomic claims, scores source authority, and clusters redundant findings using lexical and semantic analysis.
- **Critic & Gap Detection**: Independent critic agent identifies unsupported assertions, flags contradicting claims, and formulates targeted follow-up queries.
- **Strict Citation Provenance**: Every generated insight links to an explicit source URL and metadata — zero hallucinated source references.
- **Resilient Multi-Provider LLM Router**: Seamless cascading across **Ollama (local)**, **Google Gemini**, **Groq**, and **OpenRouter**, with automatic rate-limit backoff and offline deterministic fallbacks.
- **Four Ways to Operate**: Modern React Web UI, Python SDK & LangGraph, headless terminal CLI, or DeepSeek Harness skills.

---

## Architecture Overview

```text
USER GOAL
   │
   ▼
[Orchestrator] ──► Formulates structured ResearchPlan & search tasks
   │
   ▼
[Search Agent] ──► Queries arXiv, Semantic Scholar, & Web
   │
   ▼
[Evidence Extractor] ──► Batched atomic claim extraction (8 sources/prompt)
   │
   ▼
[Critic & Gap Detector] ──► Surfaces weaknesses, contradictions, and missing queries
   │
   ▼
[Convergence Check] ──► Gaps resolved? If not, loop with refined queries
   │
   ▼
[Synthesizer] ──► Compiles comprehensive report with numbered [1]..[N] citations
```

For complete details on storage layout, events, and component interactions, see [docs/architecture.md](docs/architecture.md).

---

## Getting Started

### Prerequisites
- **Node.js** `>= 20.0.0`
- **npm** `>= 10.0.0`
- *(Optional)* [Ollama](https://ollama.com/) for 100% offline, local LLM execution.

### Installation

```bash
# 1. Clone repository
git clone https://github.com/Jeevanpaul766/PROJECT-ANVESHAN.git
cd PROJECT-ANVESHAN

# 2. Install root dependencies
npm install

# 3. Install web dashboard dependencies
npm --prefix web install

# 4. Configure environment
cp .env.example .env
```

---

## Configuration

Edit `.env` to configure your preferred LLM provider. By default, Anveshan works with local Ollama or free cloud tiers:

| Provider | Base URL | Required API Key | Default Model |
|---|---|---|---|
| **Ollama (Local)** | `http://127.0.0.1:11434/v1` | `ollama` | `qwen2.5:7b` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai/` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| **Groq** | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `deepseek/deepseek-r1:free` |

---

## How to Run

### 1. Web Dashboard (Recommended)
Starts both the backend API server (`127.0.0.1:4747`) and the Vite React frontend (`127.0.0.1:5173`):
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. Enter a goal, watch real-time agent updates, and download the finished Markdown report.

### 2. Standalone API Server
Runs the Express API and serves the production-built web dashboard:
```bash
npm run build:web
npm start
```
Access the dashboard at [http://127.0.0.1:4747](http://127.0.0.1:4747).

### 3. Headless Terminal CLI
Run research directly from your terminal:
```bash
# Start a new research session
npm run research -- "Quantum error correction surface codes 2024"

# Limit planning rounds
npm run research -- --rounds 2 "Perovskite solar cell degradation mechanisms"

# Resume an interrupted or paused session
npm run research -- --resume sess_1a90fcc10c3f
```

*Pressing `Ctrl+C` cleanly pauses the session and saves all state to disk without data loss.*

### 4. Python SDK & LangGraph Integration
Install the Python SDK to invoke Anveshan from Python scripts, **LangChain tools**, or **LangGraph multi-agent state graphs**:

```bash
# Install local Python SDK with LangChain/LangGraph extras
pip install -e "./sdk/python[langchain]"
```

```python
from anveshan import AnveshanClient

client = AnveshanClient("http://127.0.0.1:4747")
report = client.research("Topological quantum error correction", rounds=2)
print(report.markdown)
```

Use Anveshan as a custom node in **LangGraph**:
```python
from langgraph.graph import StateGraph, START, END
from anveshan.integrations.langgraph import AnveshanResearchState, create_anveshan_node

builder = StateGraph(AnveshanResearchState)
builder.add_node("deep_research", create_anveshan_node(api_url="http://127.0.0.1:4747"))
builder.add_edge(START, "deep_research")
builder.add_edge("deep_research", END)
app = builder.compile()
```
*Full documentation, LangSmith tracing, and examples in [sdk/python/README.md](sdk/python/README.md).*

---

## DeepSeek Harness (DSH) Integration

Anveshan provides five ready-to-use skills in `.dsh/skills/`:
- `anveshan-deep-research`: Master skill for running end-to-end research cycles.
- `anveshan-orchestrator`: Decomposing research goals into structured search tasks.
- `anveshan-search`: Gathering papers and web sources with provenance.
- `anveshan-critic`: Critical evaluation and contradiction detection.
- `anveshan-synthesizer`: Formatting cited, structured research reports.

Open this workspace directly in DSH:
```bash
dsh open .
```
See [docs/dsh.md](docs/dsh.md) for detailed setup and usage.

---

## Verification & Testing

Every subsystem has automated tests and isolated verification probe scripts:

```bash
# Typecheck TypeScript codebase
npm run typecheck

# Execute unit and integration tests
npm test

# Run subsystem verification probes
npm run probe:search         # Test arXiv, Semantic Scholar, web providers
npm run probe:store          # Test session storage and persistence
npm run probe:orchestrator   # Test planning agent
npm run probe:critic         # Test critique agent
npm run probe:synthesizer    # Test report synthesizer
npm run probe:loop           # Test research loop (run, pause, resume)
npm run probe:api            # Test HTTP API endpoints & SSE streaming
```

---

## Documentation & Specifications

- **[plans/BUILD.md](plans/BUILD.md)**: Module build index, order, and progress tracker.
- **[docs/architecture.md](docs/architecture.md)**: Technical architecture and data flow.
- **[docs/dsh.md](docs/dsh.md)**: DeepSeek Harness integration guide.
- **[docs/adding-a-skill.md](docs/adding-a-skill.md)**: How to create custom skills for coding agents.
- **[examples/reports/sample-report.md](examples/reports/sample-report.md)**: Sample real-world research report generated by Anveshan.
- Original project specifications:
  - `Project_Anveshan_Complete_Product_Document.docx`
  - `Project_Anveshan_Detailed_Build_Roadmap.docx`

---

## Contributing

Please review [CONTRIBUTING.md](CONTRIBUTING.md) for coding conventions, build contracts, and module-by-module workflow.

---

## License

Released under the [MIT License](LICENSE). Copyright © 2026 Project Anveshan Contributors.
