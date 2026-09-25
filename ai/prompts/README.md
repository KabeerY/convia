# AI prompts

Trippy's production system prompt is defined next to the runtime that uses it:

- `backend/trippy-service/src/trippy_service/app.py`

The smoke-test prompt is in:

- `backend/trippy-service/src/trippy_service/smoke.py`

Keeping these prompts beside their execution paths makes changes reviewable with the model and tool configuration they affect.
