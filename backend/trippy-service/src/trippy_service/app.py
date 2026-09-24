import os

from fastapi import FastAPI, Response

app = FastAPI(title="Convia Trippy", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "up", "service": "trippy"}


@app.get("/ready")
def ready(response: Response) -> dict[str, object]:
    missing = [
        name for name in ("CORE_INTERNAL_URL", "TRIPPY_SERVICE_TOKEN", "GEMINI_API_KEY", "GEMINI_TEXT_MODEL")
        if not os.getenv(name)
    ]
    response.status_code = 503
    return {"ready": False, "missing": missing or ["Trippy job/tool integration (PR-13)"]}
