"""LangChain tool integration for Project Anveshan Deep Research OS."""

from __future__ import annotations
from typing import Any, Optional, Type
from pydantic import BaseModel, Field

try:
    from langchain_core.tools import BaseTool
except ImportError:
    # Graceful fallback if langchain_core is not installed
    class BaseTool:  # type: ignore[no-redef]
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            raise ImportError(
                "langchain-core is required to use AnveshanDeepResearchTool. "
                "Install it with: pip install 'anveshan[langchain]' or pip install langchain-core"
            )

from anveshan.client import AnveshanClient
from anveshan.async_client import AsyncAnveshanClient


class DeepResearchInput(BaseModel):
    """Input parameters for Anveshan Deep Research tool."""
    goal: str = Field(
        ...,
        description="The research query, academic question, or technical investigation objective."
    )
    rounds: int = Field(
        default=3,
        description="Number of iterative research and critique rounds to perform (1-5)."
    )
    model: Optional[str] = Field(
        default=None,
        description="Optional model identifier to execute research with (e.g. 'ollama:qwen2.5:7b')."
    )


class AnveshanDeepResearchTool(BaseTool):
    """LangChain tool that executes long-horizon, sourced academic deep research."""

    name: str = "anveshan_deep_research"
    description: str = (
        "An autonomous Deep Research engine for technical, scientific, or academic inquiries. "
        "Iteratively queries arXiv, Semantic Scholar, and web databases, extracts and deduplicates "
        "atomic claims, evaluates gaps, and produces an extensive Markdown report with numbered [1]..[N] sources."
    )
    args_schema: Type[BaseModel] = DeepResearchInput
    api_url: str = "http://127.0.0.1:4747"

    def _get_client(self) -> AnveshanClient:
        return AnveshanClient(base_url=self.api_url)

    def _get_async_client(self) -> AsyncAnveshanClient:
        return AsyncAnveshanClient(base_url=self.api_url)

    def _run(
        self,
        goal: str,
        rounds: int = 3,
        model: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """Synchronously execute the deep research investigation."""
        client = self._get_client()
        try:
            report = client.research(goal=goal, rounds=rounds, model=model, stream=False)
            return report.markdown
        finally:
            client.close()

    async def _arun(
        self,
        goal: str,
        rounds: int = 3,
        model: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """Asynchronously execute the deep research investigation."""
        client = self._get_async_client()
        try:
            report = await client.research(goal=goal, rounds=rounds, model=model, stream=False)
            return report.markdown
        finally:
            await client.close()
