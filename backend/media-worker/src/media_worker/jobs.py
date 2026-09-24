"""Core job protocol: claim -> download -> ingest faces -> complete.

Auth is the shared MEDIA_SERVICE_TOKEN header. Trip/actor scope is enforced
by Core; the worker never invents users or trips.
"""

from __future__ import annotations

import os

import httpx


class CoreClient:
    def __init__(self) -> None:
        base = os.getenv("CORE_INTERNAL_URL", "http://localhost:4000").rstrip("/")
        token = os.getenv("MEDIA_SERVICE_TOKEN", "")
        if not token:
            raise RuntimeError("MEDIA_SERVICE_TOKEN is required")
        self._client = httpx.Client(
            base_url=base,
            headers={"x-media-service-token": token},
            timeout=httpx.Timeout(30.0, read=120.0),
        )

    def claim(self, owner: str) -> dict | None:
        response = self._client.post("/v1/internal/media/jobs/claim", json={"owner": owner})
        response.raise_for_status()
        body = response.json()
        return body if body.get("job_id") else None

    def complete(self, job_id: str, owner: str, *, success: bool, error: str | None = None) -> dict:
        payload: dict = {"job_id": job_id, "owner": owner, "success": success}
        if error is not None:
            payload["error"] = error
        response = self._client.post("/v1/internal/media/jobs/complete", json=payload)
        response.raise_for_status()
        return response.json()

    def ingest(
        self,
        *,
        trip_id: str,
        media_id: str,
        kind: str,
        subject_user_id: str | None,
        model_version: str,
        faces: list[dict],
    ) -> dict:
        payload: dict = {
            "trip_id": trip_id,
            "media_id": media_id,
            "kind": kind,
            "model_version": model_version,
            "faces": faces,
        }
        # Core validates subject presence for reference_enroll; omit (don't
        # send null) for trip photos.
        if subject_user_id is not None:
            payload["subject_user_id"] = subject_user_id
        response = self._client.post("/v1/internal/media/results", json=payload)
        response.raise_for_status()
        return response.json()


class StorageReader:
    """Direct private-bucket reads with the service key (bypasses RLS)."""

    def __init__(self) -> None:
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SECRET_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY are required")
        self._bucket = os.getenv("MEDIA_BUCKET", "trip-media-private")
        self._client = httpx.Client(
            base_url=url,
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=httpx.Timeout(30.0, read=120.0),
            follow_redirects=True,
        )

    def download(self, object_key: str) -> bytes:
        response = self._client.get(f"/storage/v1/object/{self._bucket}/{object_key}")
        response.raise_for_status()
        return response.content
