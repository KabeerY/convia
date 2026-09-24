"""Safe example tools for exercising tool calling before real integrations exist."""

from langchain.tools import ToolRuntime, tool

from .agent import AgentRuntimeContext


@tool
def estimate_travel_minutes(distance_km: float, speed_kmph: float) -> str:
    """Estimate travel time in minutes from distance in km and speed in km/h."""

    if distance_km < 0 or speed_kmph <= 0:
        return "Distance must be non-negative and speed must be positive."
    return f"{round(distance_km / speed_kmph * 60)} minutes (estimate only)"


@tool
def current_trip_scope(runtime: ToolRuntime[AgentRuntimeContext]) -> str:
    """Read the authenticated trip scope supplied by the application, if any."""

    return runtime.context.trip_id or "No trip is selected."
