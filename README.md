# Convia

**Collective intelligence for group travel.** Built by **team pacmen** for KogniVera Hackathon 2026, PS-11: **WanderMatch — Social & Group Travel Planning**.

Convia helps a group move from *someone suggested it* to *we agreed, and the shared plan changed*. Travellers can discover a group or start a private trip, plan together, vote on changes, explore alternate paths, and ask an in-chat assistant for help. It is a hackathon prototype, not a booking service or a production deployment.

| Team member | Role |
| --- | --- |
| Y Kabeer | AI/ML · Product Systems |
| Harsh Himanshu Trivedi | AI/ML · Backend Systems |
| Akhin S | Full-Stack · Realtime UX |

## What we built

- **Shared trips:** Supabase sign-in, trip creation, public/private rooms, invitations, join requests, members, and an authenticated trip view.
- **A plan the group controls:** calendar and day-list views, drag-to-propose activity changes, group ballots, versioned itinerary updates, decision locks, and retained history. A direct edit cannot bypass a locked group decision.
- **Different paths, one trip:** branch activities can split from the main itinerary and rejoin it. Members can inspect the main or an alternate route.
- **Conversation in context:** persistent group chat and `@Trippy`. The agent can read the current trip, look up changing travel facts, and submit an activity/add/move/fork **proposal**. It cannot cast a vote or silently commit a plan change.
- **Discovery with reasons:** an optional confirmed Travel Passport (interests, pace, budget), deterministic group ranking, a Group Genome of shared anchors/tensions/unknowns, and a read-only sample guide catalogue.
- **Place and budget context:** Leaflet/OpenStreetMap activity maps with optional pins, place search and Google Maps handoff; recorded trip budgets with dated reference exchange-rate conversion.
- **Trip Memories prototype:** consented reference-selfie and trip-photo upload, trip-scoped face matching, per-person galleries and correction controls are implemented in code. The media worker needs separate configuration and an end-to-end deployment check; a finished collage is **not** included.

The landing at `/` is a warm editorial introduction with a CSS 3D doorway sequence. The authenticated application starts at `/app`. This public mirror omits the original raster PNG artwork and uses CSS illustration fallbacks.

## Architecture

```text
React + Vite browser app
  ├── Supabase Auth (identity/session)
  └── Fastify Core API (authorized trip and decision operations)
        ├── PostgreSQL/Supabase (canonical PS-11 data + additive wm_* records)
        ├── Python/LangChain Trippy service (tool calls and answers)
        └── Supabase Storage + Python/OpenCV media worker (optional photos)
```

Core verifies the Supabase session and derives the actor; the browser and the model do not choose a different user or trip for a write. Itinerary changes go through server-side proposals and votes. The main decision path uses an expected version/revision, commits an approved change once, and retains its history. For live rooms, Core emits server-sent change notifications from a polled event sequence; the client then refetches an authorized snapshot. This is not simultaneous free-text editing or a WebSocket CRDT.

The map uses OpenStreetMap tiles and straight connections between *located* stops, not road routing. Place search uses Nominatim; Google Maps links hand navigation off to Google. FX uses Frankfurter reference rates with decimal arithmetic, not an LLM-generated rate or a booking quote.

## Data model

The organizer-provided PS-11 pack is [fully synthetic and explicitly cleared for a public repository](data-model/seed/canonical/WORKING_WITH_THE_DATA.md). Its canonical CSVs contain **600 trips, 120 tour guides, 8,583 itinerary items**, and related users, preferences, proposals, votes, cities and reference data. The idempotent loader imports all 14 canonical tables; [DATA_MODEL.md](data-model/DATA_MODEL.md) documents row counts, boundary rules and additive `wm_*` records.

The 600 supplied trips appear as **sample itinerary inspiration**, not 600 active or bookable groups. A separate idempotent V0 seed creates **10 usable open trips** with members and activities after a real organizer has signed in. Public groups can be discovered and joined subject to their admission policy and capacity. Guide profiles are synthetic reference data; Convia does not book guides.

Migrations extend the supplied schema instead of renaming its tables. The database enforces member scope, admission/capacity rules, proposal revisions, and plan-change authority. Dates, money and coordinates follow the organizer's canonical rules.

## AI features

**Trippy** is a small LangChain tool-calling agent in `backend/trippy-service`. A tagged message is stored first; Core sends its question, approximately the latest 15 chat messages and trusted trip/user scope to the agent. Tools can read the plan, propose an add/move/fork for a group vote, or request a web search for changing travel facts. A tool result goes back through the model/tool loop before the final chat answer is stored. OpenRouter is the initial provider; model initialization is isolated so Fireworks can be selected without changing the agent's message and tool logic. If the service or key is unavailable, the app reports an error instead of presenting a fabricated model answer.

**Passport context handoff** does not connect to a traveller's ChatGPT or Claude account. The traveller copies a travel-only prompt into their own AI chat, pastes structured output back, reviews supported fields, and explicitly saves them. Raw pasted chat is not the Passport. Group matching then applies trip eligibility filters before a deterministic interest/pace/budget comparison; it shows reasons and treats missing evidence as unknown.

**Trip photos** use OpenCV YuNet face detection and SFace embeddings, with consented per-trip references and correction controls. This is face-assisted grouping, not a claim of general-purpose biometric identification. We have not published a measured recognition-accuracy figure.

## Run locally

Requirements: Node.js **22.12+**, the repo-pinned pnpm **10.17.1**, Python **3.12+** and `uv` for the optional Python services, plus a Supabase project with PostgreSQL and Auth for the signed-in application. No keys are needed to view the landing. Newer pnpm majors may apply different build-script policies.

```sh
pnpm install
pnpm dev:web
```

Open **http://localhost:4175/** for the landing or **http://localhost:4175/app** for the signed-in app. The app needs both Supabase Auth and Core; running the frontend alone will not make trip actions work.

For the full application:

1. Copy `.env.example` to an ignored root `.env`. Configure `MIGRATION_DATABASE_URL`, `CORE_DATABASE_URL`, the Supabase URL/publishable key, and the server-only values needed for enabled services. Never put database passwords or secret/service keys in frontend variables.
2. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in an ignored `frontend/.env.local`. Vite reads its own frontend environment; it does not load the root `.env` automatically.
3. Run `pnpm db:migrate` and `pnpm db:seed`, then `pnpm dev:core` and `pnpm dev:web`. The default Vite dev proxy sends `/v1` requests to Core on port 4000.
4. After a real Supabase account signs in once, optionally run `pnpm db:seed-v0` to add the ten open-group fixtures. This seed is idempotent.
5. To enable `@Trippy`, configure `TRIPPY_SERVICE_TOKEN`, `TRIPPY_SERVICE_URL`, `TRIPPY_CORE_API_URL`, an accessible `TRIPPY_MODEL`, and its provider key. From `backend/trippy-service`, run `uv sync`, then `uv run --env-file ../../.env uvicorn trippy_service.app:app --host 127.0.0.1 --port 4100`.

The photo pipeline additionally needs a private Supabase Storage bucket, server-only storage credentials, the media migrations and a running `backend/media-worker`. The worker is a polling process; a frontend/Core deployment alone does not process faces. See `.env.example` and the service code before enabling this feature. `/health` shows process status; `/ready` checks Core/Trippy configuration and database access where applicable.

## Demo path

1. Sign in, create a private trip and invite a second account; or use an open V0 seed trip.
2. Open its room in two browsers. View the same calendar, add or move an activity **as a proposal**, and vote from the second account. Inspect the approved plan version, lock and history.
3. Open a branch, choose its alternative path, and compare the main/branch views on the calendar and map. Unlocated activities remain visible in the list instead of receiving guessed pins.
4. Chat with the group. Mention `@Trippy` to ask about the trip or request an itinerary proposal; review and vote before any proposed change enters the shared plan.
5. Complete a Passport and inspect an explainable open-group match. Browse the synthetic sample trip and guide catalogues separately from joinable groups.

This is a suggested verification journey, **not** a claim that every step currently passes in a fresh hosted deployment. The prior Vercel deployment was taken down after the hackathon.

## Tests and proof

```sh
pnpm contracts:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm --dir frontend test
pnpm build
```

Database-backed checks require a configured test database: `pnpm test:integration`, `pnpm test:real-auth`, and `pnpm test:conformance`. The Trippy service has Python unit tests under `backend/trippy-service/tests` (`uv run python -m unittest discover -s tests -v`). [tests/README.md](tests/README.md) lists the test locations.

Unit tests and a build do not prove the two-browser vote-to-commit path or the photo worker. Run those with real, separate accounts and inspect the resulting database and media jobs before presenting them as end-to-end verified. There are no measured user-adoption, recommendation-quality or face-recognition-accuracy results.

## Scope and provenance

This repository preserves the hackathon build's commit sequence and contributor attribution. Its public history omits the two original PNG artworks, so commit hashes differ from the private team repository. It includes organizer-supplied **synthetic** data. The application is not currently hosted publicly. No open-source license is granted by this README; contributors can choose one separately.
