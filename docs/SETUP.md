# PR-01 local setup and handoff

This branch scaffolds services and freezes initial transport contracts. Domain database work starts in PR-02; votes/jobs/AI/Media become live in later PRs. A successful `/health` means a process is running. `/ready` returns 503 until its real dependencies and behavior are integrated.

## Local prerequisites

- Node.js 22.12+ (tested with 22.22.3) and pnpm 10.17.1.
- Python 3.12–3.14 and `uv` for local Python setup. Local import checks used 3.14; Docker builds used 3.12.
- Docker for optional container runs. Supabase CLI/project credentials are needed from PR-02 onward, not for this scaffold.

```sh
pnpm install --frozen-lockfile
pnpm contracts:check
pnpm test:unit
pnpm typecheck
pnpm build
uv run --project backend/trippy-service python packages/contracts/scripts/validate-python.py
```

Run each process in a separate terminal:

```sh
pnpm dev:web
pnpm dev:core
pnpm dev:core-jobs
uv run --project backend/trippy-service --env-file .env uvicorn trippy_service.app:app --host 0.0.0.0 --port 4100
uv run --project backend/media-worker --env-file .env python -m media_worker.worker
```

Web: `http://localhost:4175`. Core: `http://localhost:4000/health` and `/ready`; Core jobs: port 4001; Trippy: 4100; Media: 4200. The old `cd frontend && npm ci && npm run dev` path remains usable for the existing landing while pnpm becomes the shared workspace install. The root lockfile is the canonical workspace lockfile.

Create a local root `.env` only when you have real configuration; it is gitignored. Core reads it automatically in local dev. For Python, omit `--env-file .env` if the file does not exist. The skeletons start without it and report missing dependencies through `/ready`.

`docker compose config` validates the process topology. `docker compose up --build` starts the same skeletons; it does not provision Supabase. Container builds use the repository root so shared contracts are present.

Scripts `db:migrate`, `db:seed`, `test:integration`, `test:e2e`, and `test:conformance` intentionally fail with the PR that must implement them. They do not claim a green check before those systems exist.

## Contract handoff

`packages/contracts/schemas/domain.schema.json` is the source. `pnpm contracts:generate` updates TypeScript types, Python types/schema and OpenAPI together. `pnpm contracts:check` rejects stale generated files and validates shared fixtures. Python consumers import `convia_contracts.validate_contract`; TypeScript consumers import generated types and validate untrusted input at the boundary. Fixtures cover a valid decision request, event and job, plus invalid money, forged actor, unsupported action and missing target revision.

Core's `DomainPort` in `backend/core-api/src/module-contract.ts` is the registration contract for Harsh's HTTP modules. Harsh should request a concrete command/query signature when missing. Route code derives the actor from verified session context after PR-02; a client `actor_id` is never accepted. The placeholder modules return `MODULE_UNAVAILABLE` rather than success.

## Account inventory for PR-02 and later

| Resource | Status at PR-01 start | Needed for |
|---|---|---|
| Team-owned Supabase project, Auth, database, private Storage | Project exists; URL and publishable key provided. Server/database access and Auth settings not yet verified | PR-02 and hosted integration |
| Canonical WanderMatch SQL/CSV/conformance pack | Described in docs, not checked into this repository | PR-02 import and conformance |
| D1–D9 organizer mapping | Unprovided | `DATA_MODEL.md` mapping; leave unresolved until received |
| Gemini/model access | Not supplied | PR-13/14 |
| Maps/Places/Routes project and restricted keys | Not supplied | PR-11/13/17 |
| YuNet/SFace model artifacts and consented test photos | Not supplied | PR-18 |
| Static/container hosting accounts | Not supplied | Early skeleton deployment after PR-02 and PR-22 |

The team should grant teammates access to Supabase through the account UI and store connection details and keys in a team secret store. Use a separate local `.env` per checkout. Never commit real keys or paste them into PR descriptions. The public publishable key may be used by the browser; the secret key and database credentials stay server-side. The database role/grants, Auth mapping and canonical import are PR-02 work.
