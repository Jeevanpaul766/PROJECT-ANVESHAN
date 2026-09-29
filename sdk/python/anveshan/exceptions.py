"""Custom exceptions for Anveshan Python SDK."""

from typing import Optional, Any


class AnveshanError(Exception):
    """Base exception for all Anveshan SDK errors."""
    pass


class AnveshanAPIError(AnveshanError):
    """Raised when the Anveshan API returns an error response."""

    def __init__(self, message: str, status_code: Optional[int] = None, response_body: Optional[Any] = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body

    def __str__(self) -> str:
        if self.status_code:
            return f"[HTTP {self.status_code}] {super().__str__()}"
        return super().__str__()


class SessionNotFoundError(AnveshanAPIError):
    """Raised when the requested session ID is not found."""
    pass


class ConcurrencyError(AnveshanAPIError):
    """Raised when another research run is already executing on the same session."""
    pass


class ResearchTimeoutError(AnveshanError):
    """Raised when a research operation times out waiting for completion."""
    pass
