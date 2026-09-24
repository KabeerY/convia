"""HTTP boundary checks; no provider requests are made."""

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from trippy_service.app import app


class TrippyHttpTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    def test_run_requires_service_token(self):
        with patch.dict(os.environ, {"TRIPPY_SERVICE_TOKEN": "trusted-token"}):
            result = self.client.post("/run", json={"query": "Hello", "context": []})
        self.assertEqual(result.status_code, 401)

    def test_run_passes_app_scope_to_agent(self):
        payload = {
            "query": "How long is a 3 km walk?",
            "context": [{"role": "user", "content": "Let's walk."}],
            "trip_id": "trusted-trip",
            "user_id": "trusted-user",
        }
        with patch.dict(os.environ, {"TRIPPY_SERVICE_TOKEN": "trusted-token"}):
            with patch("trippy_service.app.TrippyAgent.run", return_value="36 minutes") as run:
                result = self.client.post(
                    "/run", json=payload, headers={"X-Trippy-Service-Token": "trusted-token"}
                )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), {"answer": "36 minutes", "change_set_id": None})
        self.assertEqual(run.call_args.kwargs["runtime_context"].trip_id, "trusted-trip")


if __name__ == "__main__":
    unittest.main()
