"""Manual OpenRouter smoke: run with an env file after adding a real API key."""

import os

from .agent import AgentRunRequest, ChatMessage, TrippyAgent
from .example_tools import estimate_travel_minutes


def main() -> None:
    agent = TrippyAgent(
        provider=os.getenv("TRIPPY_PROVIDER", "openrouter"),
        model=os.getenv("TRIPPY_MODEL", "stealth/space-bunny-alpha"),
        base_prompt=(
            "You are Trippy, a careful group-travel assistant. Use available tools when "
            "they are needed; do not invent current opening hours or pretend that a "
            "search tool exists. Keep answers concise."
        ),
        tools=[estimate_travel_minutes],
    )
    request = AgentRunRequest(
        query="For a 3 km walk at 5 km/h, use the travel-time tool. How many minutes?",
        context=[ChatMessage(role="user", sender_name="Kabeer", content="We might walk instead of taking a cab.")],
    )
    try:
        print(agent.run(request))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
