"""Synchronous HTTP client for Project Anveshan Deep Research OS."""

from __future__ import annotations
import json
import os
import time
from typing import Any, Callable, Dict, Iterator, List, Optional
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


class AnveshanClient:
    """Client for interacting with the local Anveshan Deep Research API."""

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
        self._http = httpx.Client(base_url=self.base_url, timeout=self.timeout)

    def __enter__(self) -> AnveshanClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def close(self) -> None:
        """Close the underlying HTTP client session."""
        self._http.close()

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

    def health(self) -> HealthStatus:
        """Check system health, LLM connectivity, and active version."""
        res = self._http.get("/api/health")
        self._handle_error(res)
        return HealthStatus.model_validate(res.json())

    def list_sessions(self) -> List[SessionMeta]:
        """List all research sessions currently on disk."""
        res = self._http.get("/api/sessions")
        self._handle_error(res)
        return [SessionMeta.model_validate(s) for s in res.json()]

    def create_session(self, goal: str, model: Optional[str] = None) -> SessionMeta:
        """Create a new research session with a given goal."""
        payload: Dict[str, Any] = {"goal": goal}
        if model:
            payload["model"] = model
        res = self._http.post("/api/sessions", json=payload)
        self._handle_error(res)
        return SessionMeta.model_validate(res.json())

    def get_snapshot(self, session_id: str) -> SessionSnapshot:
        """Retrieve full state snapshot for a session."""
        res = self._http.get(f"/api/sessions/{session_id}")
        self._handle_error(res)
        return SessionSnapshot.model_validate(res.json())

    def start(self, session_id: str) -> Dict[str, Any]:
        """Start or resume background research execution for a session."""
        res = self._http.post(f"/api/sessions/{session_id}/start")
        self._handle_error(res)
        return res.json()

    def pause(self, session_id: str) -> Dict[str, Any]:
        """Pause a running research session."""
        res = self._http.post(f"/api/sessions/{session_id}/pause")
        self._handle_error(res)
        return res.json()

    def get_report(self, session_id: str) -> str:
        """Fetch the Markdown report content for a session."""
        res = self._http.get(f"/api/sessions/{session_id}/report")
        self._handle_error(res)
        return res.text

    def stream_events(
        self, session_id: str, timeout: Optional[float] = None
    ) -> Iterator[SessionEvent]:
        """Stream real-time Server-Sent Events (SSE) for a research session."""
        req_timeout = timeout or self.timeout
        with self._http.stream(
            "GET", f"/api/sessions/{session_id}/events", timeout=req_timeout
        ) as response:
            self._handle_error(response)
            buffer = ""
            for line in response.iter_lines():
                if line.startswith("data:"):
                    data_str = line[len("data:"):].strip()
                    if data_str:
                        try:
                            payload = json.loads(data_str)
                            yield SessionEvent.model_validate(payload)
                        except (json.JSONDecodeError, ValueError):
                            pass

    def research(
        self,
        goal: str,
        rounds: int = 3,
        model: Optional[str] = None,
        stream: bool = True,
        on_event: Optional[Callable[[SessionEvent], None]] = None,
        timeout: float = 1800.0,
    ) -> ResearchReport:
        """Execute an autonomous end-to-end deep research run.

        Args:
            goal: The research objective or question.
            rounds: Maximum number of iterative planning and critique rounds.
            model: Optional model identifier (defaults to system setting).
            stream: If True, prints formatted live events to stdout.
            on_event: Optional callback invoked for each SessionEvent.
            timeout: Maximum seconds to wait for completion (default 30 mins).

        Returns:
            ResearchReport containing the cited Markdown report, sources, and metrics.
        """
        start_time = time.time()
        meta = self.create_session(goal=goal, model=model)
        session_id = meta.id

        if stream:
            print(f"\n🧭 Anveshan Deep Research started [Session {session_id}]")
            print(f"Goal: {goal}\n")

        self.start(session_id)

        # Monitor live SSE stream until completion
        deadline = start_time + timeout
        completed = False
        failed = False
        error_msg = None

        try:
            for event in self.stream_events(session_id, timeout=timeout):
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
                # Check status via snapshot fallback
                snap = self.get_snapshot(session_id)
                if snap.meta.status == "completed":
                    completed = True
                elif snap.meta.status == "failed":
                    failed = True
                    error_msg = snap.meta.error
                else:
                    raise e

        if failed:
            raise AnveshanAPIError(f"Research failed: {error_msg}")

        snap = self.get_snapshot(session_id)
        report_md = snap.reportMarkdown or self.get_report(session_id)
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
