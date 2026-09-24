# Trippy agent (first version)

This package contains the Python/LangChain agent and a small service-to-service
`POST /run` endpoint. The existing chat application is not wired to it yet;
Core must detect `@trippy`, remove the mention, fetch recent messages, authorize
the trip/user, and pass that scope with `X-Trippy-Service-Token`.

From this directory, install and test with Python 3.12+ and `uv`:

```sh
uv sync
uv run python -m unittest discover -s tests -v
```

Set `OPENROUTER_API_KEY` in the repository root `.env`, then exercise the
configured Space Bunny Alpha model with a synthetic, non-private conversation:

```sh
uv run --env-file ../../.env python -m trippy_service.smoke
```

The smoke test asks the model to call `estimate_travel_minutes`. The offline
test also verifies a native model tool call and result, without using an API
key. A missing key raises a clear configuration error.

`/health` checks the process and `/ready` checks agent credentials. `/run`
requires the service token; it accepts `query`, `context`, `trip_id`, and
`user_id`, and returns `{ "answer": "..." }`. Keep the token server-side. The
endpoint is not a public user API and does not itself verify trip membership.

```python
from trippy_service.agent import (
    AgentRunRequest, AgentRuntimeContext, ChatMessage, TrippyAgent,
)
from trippy_service.example_tools import estimate_travel_minutes

agent = TrippyAgent(
    provider="openrouter",
    model="stealth/space-bunny-alpha",
    base_prompt="You are Trippy, a helpful group travel assistant.",
    tools=[estimate_travel_minutes],
)
answer = agent.run(
    AgentRunRequest(
        query="How long to walk 3 km at 5 km/h?",
        context=[ChatMessage(role="user", sender_name="Kabeer", content="Let's walk.")],
    ),
    runtime_context=AgentRuntimeContext(trip_id="authenticated-trip-id"),
)
```

`context` is ordered oldest to newest; `run` retains at most the latest 15
messages and appends the current query. The system prompt comes only from the
application, never from chat. `AgentRuntimeContext` is supplied separately by
the authenticated backend, not by the model. Tools can read it through
LangChain's `ToolRuntime`; those fields are omitted from model-visible tool
schemas. Real itinerary tools must additionally enforce authorization and the
app's proposal/vote rules before any write. This first version includes no
itinerary-write tools.

Provider setup lives in `providers.py`. To switch later, install the optional
Fireworks dependency (`uv sync --extra fireworks`), set `FIREWORKS_API_KEY`, and
construct the same agent with `provider="fireworks"` and a Fireworks model ID.
The agent's message mapping, tool loop, and runtime-context API do not change.
