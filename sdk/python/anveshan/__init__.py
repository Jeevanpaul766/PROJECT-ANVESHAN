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
