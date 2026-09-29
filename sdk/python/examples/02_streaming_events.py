#!/usr/bin/env python3
"""Project Anveshan Python SDK — Real-time Event Streaming.

Demonstrates subscribing to live agent telemetry events via SSE.
"""

from anveshan import AnveshanClient, SessionEvent


def on_agent_event(event: SessionEvent) -> None:
    """Callback triggered whenever an agent emits a telemetry event."""
    ts = event.ts.split("T")[-1][:8]  # HH:MM:SS
    print(f"[{ts}] [{event.agent.upper():<12}] ({event.type:<10}) {event.message}")


def main() -> None:
    client = AnveshanClient()

    goal = "Perovskite solar cell degradation mechanisms"
    print(f"Starting session for: {goal}\n")

    # Pass the event callback to capture custom logic per event
    report = client.research(
        goal=goal,
        rounds=1,
        stream=False,  # We use our custom callback instead of the default printer
        on_event=on_agent_event,
    )

    print(f"\nCompleted in {report.duration_seconds}s with {len(report.sources)} sources.")


if __name__ == "__main__":
    main()
