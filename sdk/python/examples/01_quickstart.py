#!/usr/bin/env python3
"""Project Anveshan Python SDK — Quickstart Example.

Usage:
    python 01_quickstart.py
"""

from anveshan import AnveshanClient


def main() -> None:
    # 1. Initialize client (defaults to http://127.0.0.1:4747)
    client = AnveshanClient()

    # 2. Check system health
    health = client.health()
    print(f"Connected to Anveshan v{health.version} [LLM: {health.llm.model if health.llm else 'Offline'}]")

    # 3. Run autonomous deep research
    goal = "Quantum error correction surface codes 2024"
    print(f"\nInitiating deep research for: {goal}")

    report = client.research(
        goal=goal,
        rounds=2,
        model="ollama:qwen2.5:7b",  # Lightweight model (keeps Mac cool & quiet)
        stream=True,                 # Stream live events to console
    )

    # 4. Inspect results
    print("\n" + "=" * 60)
    print("RESEARCH COMPLETE")
    print("=" * 60)
    print(f"Session ID : {report.session_id}")
    print(f"Rounds     : {report.rounds_completed}")
    print(f"Duration   : {report.duration_seconds}s")
    print(f"Sources    : {len(report.sources)} gathered")
    print(f"Claims     : {len(report.claims)} verified")

    print("\nTop Sources Discovered:")
    for i, s in enumerate(report.sources[:5], 1):
        print(f"  [{i}] {s.title} ({s.kind})")
        print(f"      URL: {s.url}")

    # 5. Access the full cited markdown
    print(f"\nReport Preview ({len(report.markdown)} characters):")
    print(report.markdown[:500] + "...\n")


if __name__ == "__main__":
    main()
