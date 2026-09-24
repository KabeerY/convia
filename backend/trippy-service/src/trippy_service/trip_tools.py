"""Small, trip-scoped tools for the chat agent. The model cannot set actor IDs."""

import json
import os

import httpx
from langchain_core.tools import BaseTool, tool

from .agent import AgentRuntimeContext


def _core_tool(scope: AgentRuntimeContext, action: str, draft: dict | None = None, proposal_ids: list[str] | None = None) -> str:
    if not scope.trip_id or not scope.user_id:
        return "This request has no authenticated trip scope."
    base = os.getenv("TRIPPY_CORE_API_URL", "").rstrip("/")
    token = os.getenv("TRIPPY_SERVICE_TOKEN", "")
    if not base or not token:
        return "Trip tools are not configured on the server."
    try:
        response = httpx.post(
            f"{base}/v1/internal/trippy/tool",
            headers={"X-Trippy-Service-Token": token},
            json={"trip_id": scope.trip_id, "user_id": scope.user_id, "action": action,
                  **({"draft": draft} if draft is not None else {})},
            timeout=15,
        )
        payload = response.json()
        if response.is_error:
            return f"Trip tool rejected the request: {payload.get('error', {}).get('code', response.status_code)}. No plan change was made."
        if action == "propose_change" and proposal_ids is not None and payload.get("change_set_id"):
            proposal_ids.append(payload["change_set_id"])
        return json.dumps(payload, default=str)[:12000]
    except (httpx.HTTPError, ValueError) as exc:
        return f"Trip tool unavailable: {type(exc).__name__}. No plan change was made."


def build_trip_tools(scope: AgentRuntimeContext, model: str, proposal_ids: list[str] | None = None) -> list[BaseTool]:
    @tool
    def read_trip_plan() -> str:
        """Read the current authenticated trip dates, time zone and itinerary. Call before proposing calendar changes."""
        return _core_tool(scope, "read_plan")

    @tool
    def propose_activity(title: str, day_index: int, starts_at: str, ends_at: str, item_type: str = "poi") -> str:
        """Propose a new trip activity for a group vote; never directly edits the approved calendar. Times need ISO 8601 offsets and must fit the trip dates."""
        return _core_tool(scope, "propose_change", {
            "action": "add", "message": "Activity proposed for a group vote.", "title": title,
            "day_index": day_index, "starts_at": starts_at, "ends_at": ends_at, "item_type": item_type,
        }, proposal_ids)

    @tool
    def propose_move(source_item_id: str, day_index: int, starts_at: str, ends_at: str) -> str:
        """Propose moving an existing itinerary item for a group vote. First read the plan to get its real item ID and current dates."""
        return _core_tool(scope, "propose_change", {
            "action": "move", "message": "Move proposed for a group vote.",
            "source_item_id": source_item_id, "day_index": day_index,
            "starts_at": starts_at, "ends_at": ends_at,
        }, proposal_ids)

    @tool
    def propose_fork(source_item_id: str, title: str, day_index: int, starts_at: str, ends_at: str, rejoin_at: str) -> str:
        """Propose an alternate group activity and a later rejoin time for voting. First read the existing item IDs and trip dates."""
        return _core_tool(scope, "propose_change", {
            "action": "fork", "message": "Fork proposed for a group vote.",
            "source_item_id": source_item_id, "title": title, "item_type": "poi",
            "day_index": day_index, "starts_at": starts_at, "ends_at": ends_at,
            "rejoin_at": rejoin_at,
        }, proposal_ids)

    @tool
    def web_search(query: str) -> str:
        """Search the live web for current opening hours, availability, prices or other changing travel facts; return source URLs."""
        key = os.getenv("OPENROUTER_API_KEY", "")
        if not key:
            return "Web search is not configured. Do not guess current facts."
        try:
            response = httpx.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "Use web search to answer with source URLs. If search fails, say so; do not guess."},
                        {"role": "user", "content": query[:300]},
                    ],
                    "tools": [{"type": "openrouter:web_search", "parameters": {"engine": "parallel", "mode": "turbo", "max_results": 3, "max_uses": 1}}],
                    "tool_choice": "required",
                    "max_tool_calls": 1,
                },
                timeout=20,
            )
            if response.is_error:
                return f"Live web search unavailable (HTTP {response.status_code}). Do not guess current facts."
            payload = response.json()
            choice = payload.get("choices", [{}])[0].get("message", {})
            answer = choice.get("content") or ""
            citations = [
                {"title": item.get("url_citation", {}).get("title"), "url": item.get("url_citation", {}).get("url")}
                for item in (choice.get("annotations") or [])[:5]
                if item.get("type") == "url_citation"
            ]
            return json.dumps({"answer": str(answer)[:3500], "citations": citations}, default=str)
        except (httpx.HTTPError, ValueError):
            return "Live web search unavailable. Do not guess current facts."

    return [read_trip_plan, propose_activity, propose_move, propose_fork, web_search]
