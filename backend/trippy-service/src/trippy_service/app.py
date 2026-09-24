"""Small authenticated HTTP boundary for the Trippy agent."""

import hmac
import os

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .agent import AgentRunRequest, AgentRuntimeContext, TrippyAgent
from .example_tools import current_trip_scope, estimate_travel_minutes
from .trip_tools import build_trip_tools

app = FastAPI(title="Convia Trippy", version="0.1.0")


class AgentInvocation(AgentRunRequest):
    """Authenticated Core supplies the scope; the model cannot choose it."""

    trip_id: str | None = None
    user_id: str | None = None


class AgentAnswer(BaseModel):
    answer: str
    change_set_id: str | None = None


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
    scope = AgentRuntimeContext(trip_id=request.trip_id, user_id=request.user_id)
    proposal_ids: list[str] = []
    agent = TrippyAgent(
        provider=provider,
        model=model,
        base_prompt=(
            "You are Trippy, a concise assistant inside one group trip. Stay on travel and this trip; "
            "politely decline unrelated coding or general homework requests. "
            "Use read_trip_plan before calendar proposals, and web_search for current place hours or prices. "
            "Never invent a place, date, opening time, or source URL. Use actual trip dates and timezone. "
            "When asked to add or change a plan, call the proposal tool if details are sufficient; "
            "the tool only creates a group vote and cannot commit a change. "
            "Never claim the approved itinerary changed unless a tool explicitly confirms that. "
            "If a tool fails, say what is missing and ask one short clarifying question."
        ),
        tools=[*build_trip_tools(scope, model, proposal_ids), estimate_travel_minutes, current_trip_scope],
    )
    try:
        answer = await run_in_threadpool(
            agent.run,
            AgentRunRequest(query=request.query, context=request.context),
            runtime_context=scope,
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return AgentAnswer(answer=answer, change_set_id=proposal_ids[-1] if proposal_ids else None)
