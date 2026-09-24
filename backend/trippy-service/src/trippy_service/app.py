"""Small authenticated HTTP boundary for the Trippy agent."""

import hmac
import os

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .agent import AgentRunRequest, AgentRuntimeContext, TrippyAgent
from .example_tools import current_trip_scope, estimate_travel_minutes

app = FastAPI(title="Convia Trippy", version="0.1.0")


class AgentInvocation(AgentRunRequest):
    """Authenticated Core supplies the scope; the model cannot choose it."""

    trip_id: str | None = None
    user_id: str | None = None


class AgentAnswer(BaseModel):
    answer: str


def configured(name: str) -> bool:
    value = os.getenv(name, "")
    return bool(value) and not value.startswith("replace-")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "up", "service": "trippy"}


@app.get("/ready")
def ready(response: Response) -> dict[str, object]:
    provider = os.getenv("TRIPPY_PROVIDER", "openrouter").lower()
    key_name = "OPENROUTER_API_KEY" if provider == "openrouter" else "FIREWORKS_API_KEY"
    missing = [name for name in ("TRIPPY_SERVICE_TOKEN", key_name) if not configured(name)]
    if provider not in {"openrouter", "fireworks"}:
        missing.append("supported TRIPPY_PROVIDER")
    response.status_code = 503 if missing else 200
    return {"ready": not missing, "missing": missing}


@app.post("/run", response_model=AgentAnswer)
async def run_agent(
    request: AgentInvocation,
    x_trippy_service_token: str | None = Header(default=None),
) -> AgentAnswer:
    token = os.getenv("TRIPPY_SERVICE_TOKEN", "")
    if not configured("TRIPPY_SERVICE_TOKEN") or not x_trippy_service_token or not hmac.compare_digest(
        x_trippy_service_token, token
    ):
        raise HTTPException(status_code=401, detail="Invalid service token")

    provider = os.getenv("TRIPPY_PROVIDER", "openrouter")
    model = os.getenv("TRIPPY_MODEL", "stealth/space-bunny-alpha")
    agent = TrippyAgent(
        provider=provider,
        model=model,
        base_prompt=(
            "You are Trippy, a concise group-travel assistant. Use a tool when it helps. "
            "Do not invent current place hours, prices, or facts when no search tool is available. "
            "Never claim an itinerary change was saved unless a tool confirms it."
        ),
        tools=[estimate_travel_minutes, current_trip_scope],
    )
    try:
        answer = await run_in_threadpool(
            agent.run,
            AgentRunRequest(query=request.query, context=request.context),
            runtime_context=AgentRuntimeContext(trip_id=request.trip_id, user_id=request.user_id),
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return AgentAnswer(answer=answer)
