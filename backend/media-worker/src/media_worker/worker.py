"""Media worker: health endpoint + media job poll loop.

Polls Core for queued photo_process / reference_enroll jobs, runs YuNet+SFace
on CPU, and posts normalized embeddings back for trip-scoped matching.
"""

from __future__ import annotations

import json
import os
import socket
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

from .faces import MODEL_VERSION, FaceEngine
from .jobs import CoreClient, StorageReader
from .pipeline import default_max_pixels, load_bgr

OWNER = f"{socket.gethostname()}-{os.getpid()}"


class StatusHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            status, body = 200, {"status": "up", "service": "media-worker"}
        elif self.path == "/ready":
            missing = [
                name
                for name in ("CORE_INTERNAL_URL", "MEDIA_SERVICE_TOKEN", "SUPABASE_URL", "SUPABASE_SECRET_KEY")
                if not os.getenv(name)
            ]
            try:
                FaceEngine()
            except Exception as exc:  # noqa: BLE001 - readiness must report, not crash
                body = {"ready": False, "missing": missing + [f"face models: {exc}"]}
                status = 503
            else:
                status = 200 if not missing else 503
                body = {"ready": not missing, "missing": missing}
        else:
            status, body = 404, {"error": "not_found"}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args: object) -> None:
        pass


def process_claim(core: CoreClient, storage: StorageReader, engine: FaceEngine, claim: dict) -> None:
    payload = claim.get("payload", {})
    media = claim.get("media") or {}
    job_id = claim["job_id"]
    kind = payload.get("kind", "photo_process")
    trip_id = payload.get("trip_id")
    media_id = payload.get("media_id")
    object_key = payload.get("object_key") or media.get("object_key")
    subject = (
        payload.get("subject_user_id") or media.get("uploader_user_id")
        if kind == "reference_enroll"
        else None
    )
    if not trip_id or not media_id or not object_key:
        core.complete(job_id, OWNER, success=False, error="MALFORMED_JOB")
        return
    try:
        image_bytes = storage.download(object_key)
        bgr = load_bgr(image_bytes, default_max_pixels())
        detected = engine.extract(bgr)
    except Exception as exc:  # noqa: BLE001 - worker must fail the job, not crash
        traceback.print_exc()
        core.complete(job_id, OWNER, success=False, error=f"PROCESS_FAILED:{exc}"[:500])
        return

    if kind == "reference_enroll" and len(detected) != 1:
        # Permanent input problem, not a retryable failure: report it so the
        # user retakes the selfie instead of burning 5 lease attempts.
        reason = "NO_FACE" if not detected else "MULTIPLE_FACES"
        core.complete(job_id, OWNER, success=False, error=f"REFERENCE_{reason}")
        return

    try:
        result = core.ingest(
            trip_id=trip_id,
            media_id=media_id,
            kind=kind,
            subject_user_id=subject,
            model_version=MODEL_VERSION,
            faces=[
                {
                    "bbox": face.bbox,
                    "embedding": face.embedding,
                    "detection_score": face.detection_score,
                }
                for face in detected
            ],
        )
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        core.complete(job_id, OWNER, success=False, error=f"INGEST_FAILED:{exc}"[:500])
        return
    core.complete(job_id, OWNER, success=True)
    print(f"processed {kind} {media_id}: {result}", flush=True)


def loop_forever() -> None:
    poll_seconds = float(os.getenv("MEDIA_WORKER_POLL_SECONDS", "3"))
    core = CoreClient()
    storage = StorageReader()
    engine = FaceEngine()
    print(f"media worker {OWNER} ready (model {MODEL_VERSION})", flush=True)
    while True:
        try:
            claim = core.claim(OWNER)
        except Exception:  # noqa: BLE001 - Core may restart; keep polling
            traceback.print_exc()
            time.sleep(poll_seconds)
            continue
        if not claim:
            time.sleep(poll_seconds)
            continue
        try:
            process_claim(core, storage, engine, claim)
        except Exception:  # noqa: BLE001 - never let one job kill the loop
            traceback.print_exc()
            try:
                core.complete(claim["job_id"], OWNER, success=False, error="WORKER_EXCEPTION")
            except Exception:  # noqa: BLE001
                traceback.print_exc()


def main() -> None:
    threading.Thread(target=loop_forever, daemon=True).start()
    port = int(os.getenv("MEDIA_STATUS_PORT", "4200"))
    HTTPServer(("0.0.0.0", port), StatusHandler).serve_forever()


if __name__ == "__main__":
    main()
