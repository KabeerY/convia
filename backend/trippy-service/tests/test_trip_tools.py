"""Offline checks for bound trip scope and proposal semantics."""

import os
import unittest
from unittest.mock import Mock, patch

from trippy_service.agent import AgentRuntimeContext
from trippy_service.trip_tools import build_trip_tools


class TripToolTests(unittest.TestCase):
    def test_read_tool_uses_trusted_scope(self):
        response = Mock(is_error=False)
        response.json.return_value = {"trip": {"title": "Manali"}, "itinerary": {"version": 1}}
        scope = AgentRuntimeContext(trip_id="trusted-trip", user_id="trusted-user")
        with patch.dict(os.environ, {"TRIPPY_CORE_API_URL": "https://core.example", "TRIPPY_SERVICE_TOKEN": "secret"}):
            with patch("trippy_service.trip_tools.httpx.post", return_value=response) as post:
                read = next(item for item in build_trip_tools(scope, "test-model") if item.name == "read_trip_plan")
                self.assertIn("Manali", read.invoke({}))
        self.assertEqual(post.call_args.kwargs["json"]["trip_id"], "trusted-trip")
        self.assertEqual(post.call_args.kwargs["json"]["user_id"], "trusted-user")
        self.assertNotIn("draft", post.call_args.kwargs["json"])
        self.assertNotIn("trip_id", read.args)

    def test_proposal_id_is_recorded_only_after_core_accepts(self):
        response = Mock(is_error=False)
        response.json.return_value = {"change_set_id": "chg_123", "status": "proposed_for_group_vote"}
        proposals = []
        scope = AgentRuntimeContext(trip_id="trusted-trip", user_id="trusted-user")
        with patch.dict(os.environ, {"TRIPPY_CORE_API_URL": "https://core.example", "TRIPPY_SERVICE_TOKEN": "secret"}):
            with patch("trippy_service.trip_tools.httpx.post", return_value=response) as post:
                propose = next(item for item in build_trip_tools(scope, "test-model", proposals) if item.name == "propose_activity")
                result = propose.invoke({"title": "Temple visit", "day_index": 1, "starts_at": "2026-10-03T08:30:00+05:30", "ends_at": "2026-10-03T10:00:00+05:30"})
        self.assertIn("proposed_for_group_vote", result)
        self.assertEqual(proposals, ["chg_123"])
        self.assertEqual(post.call_args.kwargs["json"]["draft"]["action"], "add")


if __name__ == "__main__":
    unittest.main()
