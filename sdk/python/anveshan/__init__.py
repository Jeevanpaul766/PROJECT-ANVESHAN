"""Project Anveshan Python SDK — Deep Research OS Client."""

from anveshan.client import AnveshanClient
from anveshan.async_client import AsyncAnveshanClient
from anveshan.exceptions import (
    AnveshanError,
    AnveshanAPIError,
    SessionNotFoundError,
    ConcurrencyError,
    ResearchTimeoutError,
)
from anveshan.models import (
    Source,
    Finding,
    Claim,
    Critique,
    ResearchTask,
    ResearchPlan,
    RunMetrics,
    SessionMeta,
    SessionEvent,
    SessionSnapshot,
    HealthStatus,
    ResearchReport,
)

import os
from pathlib import Path

def _autoload_env() -> None:
    """Automatically find and load .env from parent directories if present."""
    current = Path(__file__).resolve().parent
    for _ in range(6):
        env_file = current / ".env"
        if env_file.is_file():
            try:
                with open(env_file, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip().strip("'\"")
                            if k and k not in os.environ:
                                os.environ[k] = v
                break
            except Exception:
                pass
        if current.parent == current:
            break
        current = current.parent

_autoload_env()

__version__ = "0.2.0"


__all__ = [
    "AnveshanClient",
    "AsyncAnveshanClient",
    "AnveshanError",
    "AnveshanAPIError",
    "SessionNotFoundError",
    "ConcurrencyError",
    "ResearchTimeoutError",
    "Source",
    "Finding",
    "Claim",
    "Critique",
    "ResearchTask",
    "ResearchPlan",
    "RunMetrics",
    "SessionMeta",
    "SessionEvent",
    "SessionSnapshot",
    "HealthStatus",
    "ResearchReport",
]
