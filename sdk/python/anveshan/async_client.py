"""Asynchronous HTTP client for Project Anveshan Deep Research OS."""

from __future__ import annotations
import asyncio
import json
import os
import time
from typing import Any, AsyncIterator, Callable, Dict, List, Optional
import httpx

from anveshan.exceptions import (
    AnveshanAPIError,
    ConcurrencyError,
    ResearchTimeoutError,
    SessionNotFoundError,
)
from anveshan.models import (
    HealthStatus,
    ResearchReport,
    SessionEvent,
    SessionMeta,
    SessionSnapshot,
)


class AsyncAnveshanClient:
    """Asynchronous client for interacting with the local Anveshan Deep Research API."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: float = 120.0,
    ) -> None:
        self.base_url = (
            base_url
            or os.environ.get("ANVESHAN_API_URL")
            or "http://127.0.0.1:4747"
        ).rstrip("/")
        self.timeout = timeout
        self._http = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)

    async def __aenter__(self) -> AsyncAnveshanClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def close(self) -> None:
        """Close the underlying HTTP client session."""
        await self._http.aclose()

    def _handle_error(self, response: httpx.Response) -> None:
        if response.is_success:
            return
        status = response.status_code
        try:
            body = response.json()
            message = body.get("error", response.text)
        except Exception:
            body = None
            message = response.text or f"HTTP {status}"

        if status == 404:
            raise SessionNotFoundError(message, status_code=status, response_body=body)
        if status == 409 or "already running" in message.lower():
            raise ConcurrencyError(message, status_code=status, response_body=body)
        raise AnveshanAPIError(message, status_code=status, response_body=body)

    async def health(self) -> HealthStatus:
        """Check system health, LLM connectivity, and active version."""
        res = await self._http.get("/api/health")
        self._handle_error(res)
        return HealthStatus.model_validate(res.json())

    async def list_sessions(self) -> List[SessionMeta]:
        """List all research sessions currently on disk."""
        res = await self._http.get("/api/sessions")
        self._handle_error(res)
        return [SessionMeta.model_validate(s) for s in res.json()]

    async def create_session(self, goal: str, model: Optional[str] = None) -> SessionMeta:
        """Create a new research session with a given goal."""
        payload: Dict[str, Any] = {"goal": goal}
        if model:
            payload["model"] = model
        res = await self._http.post("/api/sessions", json=payload)
        self._handle_error(res)
        return SessionMeta.model_validate(res.json())

    async def get_snapshot(self, session_id: str) -> SessionSnapshot:
        """Retrieve full state snapshot for a session."""
        res = await self._http.get(f"/api/sessions/{session_id}")
        self._handle_error(res)
        return SessionSnapshot.model_validate(res.json())

    async def start(self, session_id: str) -> Dict[str, Any]:
        """Start or resume background research execution for a session."""
        res = await self._http.post(f"/api/sessions/{session_id}/start")
        self._handle_error(res)
        return res.json()

    async def pause(self, session_id: str) -> Dict[str, Any]:
        """Pause a running research session."""
        res = await self._http.post(f"/api/sessions/{session_id}/pause")
        self._handle_error(res)
        return res.json()

    async def get_report(self, session_id: str) -> str:
        """Fetch the Markdown report content for a session."""
        res = await self._http.get(f"/api/sessions/{session_id}/report")
        self._handle_error(res)
        return res.text

    async def stream_events(
        self, session_id: str, timeout: Optional[float] = None
    ) -> AsyncIterator[SessionEvent]:
        """Stream real-time Server-Sent Events (SSE) asynchronously."""
        req_timeout = timeout or self.timeout
        async with self._http.stream(
            "GET", f"/api/sessions/{session_id}/events", timeout=req_timeout
        ) as response:
            self._handle_error(response)
            async for line in response.aiter_lines():
                if line.startswith("data:"):
                    data_str = line[len("data:"):].strip()
                    if data_str:
                        try:
                            payload = json.loads(data_str)
                            yield SessionEvent.model_validate(payload)
                        except (json.JSONDecodeError, ValueError):
                            pass

    async def research(
        self,
        goal: str,
        rounds: int = 3,
        model: Optional[str] = None,
        stream: bool = False,
        on_event: Optional[Callable[[SessionEvent], None]] = None,
        timeout: float = 1800.0,
    ) -> ResearchReport:
        """Asynchronously execute an autonomous end-to-end deep research run."""
        start_time = time.time()
        meta = await self.create_session(goal=goal, model=model)
        session_id = meta.id

        await self.start(session_id)

        deadline = start_time + timeout
        completed = False
        failed = False
        error_msg = None

        try:
            async for event in self.stream_events(session_id, timeout=timeout):
                if on_event:
                    on_event(event)

                if stream:
                    icon_map = {
                        "status": "◆",
                        "plan": "📋",
                        "search": "🔍",
                        "finding": "✦",
                        "critic": "⚖️",
                        "synthesize": "✍️",
                        "error": "✖",
                    }
                    icon = icon_map.get(event.type, "·")
                    print(f"  {icon} [{event.agent}] {event.message}")

                if event.type == "status" and "completed" in event.message.lower():
                    completed = True
                    break
                if event.type == "error":
                    failed = True
                    error_msg = event.message
                    break

                if time.time() > deadline:
                    raise ResearchTimeoutError(f"Research run timed out after {timeout} seconds")
        except Exception as e:
            if not completed:
                snap = await self.get_snapshot(session_id)
                if snap.meta.status == "completed":
                    completed = True
                elif snap.meta.status == "failed":
                    failed = True
                    error_msg = snap.meta.error
                else:
                    raise e

        if failed:
            raise AnveshanAPIError(f"Research failed: {error_msg}")

        snap = await self.get_snapshot(session_id)
        report_md = snap.reportMarkdown or await self.get_report(session_id)
        sources = [f.source for f in snap.findings]

        return ResearchReport(
            session_id=session_id,
            goal=goal,
            markdown=report_md,
            sources=sources,
            claims=snap.claims,
            rounds_completed=snap.meta.roundsCompleted,
            duration_seconds=round(time.time() - start_time, 2),
            metrics=snap.meta.metrics,
        )
