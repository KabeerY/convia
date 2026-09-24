# Convia — Three-Person Ownership and PR Plan

Version: 1.0 · 24 September 2026 · Team pacmen

**Kabeer: frontend, experience, Trippy and final product integration. Akhin: Core architecture, database, decision correctness, realtime, privacy and Media. Harsh: bounded backend routes, provider adapters, fixtures and backend verification.**

This division follows the team's available tooling: Kabeer and Akhin have Codex; Harsh has Muse Spark 1.3 through OpenCode. Larger implementation and reasoning tasks go to the two Codex workstreams. Harsh has no frontend, visual-design, CSS or animation assignments. His tasks have narrow inputs, outputs and explicit checks.

This document assigns work; it does not change the product or introduce another architecture. Read it alongside:

- [PRODUCT.md](PRODUCT.md): P01–P18, user flows, feature scope and behavior.
- [ARCHITECTURE.md](ARCHITECTURE.md): SVC-01–SVC-04, schema, APIs, permissions and transactions.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): I00–I23 and E01–E03, the implementation dependencies and acceptance checks.
- [HACKATHON.md](../HACKATHON.md): official repository and README requirements.

## 1. Current baseline and numbering

The repository is `kognivera-org/kv-hack2026-pacmen`; the default branch is **master**. The reviewed local baseline is commit `219ce7e`: the warm landing, temple animation, illustrative local interactions and the three specifications. Backend services, real authentication, multi-user voting, live Trippy and photo processing are not implemented by that commit. Keep the existing landing; do not restart or redesign it while adding application screens.

**PR-01 through PR-23 below are planning IDs, not reserved GitHub issue/PR numbers.** At the time this plan was prepared, GitHub returned no existing PRs. GitHub assigns its own numbers when PRs are opened; issues can also consume numbers. Put the planning ID in the title and branch, then record the actual PR URL in the PR description or team tracker. Do not wait for a particular GitHub number.

Use titles such as `[PR-05] Commit approved itinerary changes atomically` and branches such as `akhin/pr-05-decision-engine`. One person owns each planned PR. A reviewer is not a second simultaneous editor of that branch.

This is a complete feature allocation, not a promise that 23 PRs fit a fixed number of hours. If adjacent tasks need one PR for speed, preserve their planning IDs, owner, dependencies and acceptance checks in that PR. Do not combine unrelated owners' work merely to reduce the count.

## 2. Responsibility split

| Person | Main responsibility | Owns | Must route to another owner |
|---|---|---|---|
| **Kabeer** | Product experience and AI behavior | All SVC-01 UI; app navigation and mobile UX; SVC-03 Trippy; reusable `ai/` pipeline/prompts/evals; voice onboarding; browser E2E tests; final product walkthrough | Database writes, lock rules, membership authority, grants and internal Core authorization go through Akhin's Core contracts |
| **Akhin** | System correctness and durable state | SVC-02 foundation; canonical/additive schema; auth/RBAC; transactions; voting/locks/history; realtime/jobs; matching/Genome; branches; location/contact security; SVC-04 Media; backend deployment | Screen layout, copy, motion and frontend styling go to Kabeer; bounded route/adaptor implementation goes to Harsh |
| **Harsh** | Smaller backend packages and reproducibility | Trip HTTP adapters; chat/enquiry HTTP and scoped application logic; discovery/guide endpoints; Maps/Places adapters; Media HTTP adapters; demo fixtures; backend smoke checks and QA runbook | No frontend changes. No new architecture, migration strategy, voting algorithm, scoring weights, cryptography or face-recognition algorithm |

**Service boundaries remain unchanged:** frontend calls Core; Trippy and Media call scoped Core APIs; Core owns durable domain writes. Harsh implements modules *inside* SVC-02, not a fifth service or a separate database.

Akhin has more critical infrastructure work. Protect that time: Harsh handles repeatable backend surface work, and Kabeer owns AI implementation as well as UI. Do not turn Akhin into the person who also writes everyone's route handlers, screenshots and demo copy.

## 3. File ownership and collision prevention

These are target paths within the architecture's existing directories. Some do not exist yet. PR-01 establishes the directory skeleton, contracts and module registration points; ownership below applies after that PR merges.

| Path / resource | Sole implementation owner | Review / handoff rule |
|---|---|---|
| `frontend/**` | Kabeer | Harsh and Akhin report UI/API issues; Kabeer applies frontend fixes |
| `backend/trippy-service/**`, `ai/**` | Kabeer | Akhin reviews tool permissions and capability boundaries; no direct DB access |
| `backend/media-worker/**` | Akhin | Kabeer reviews the upload/search/export user flow, not the model internals |
| `backend/core-api/src/auth/**`, `realtime/**`, `jobs/**`, `internal/**` | Akhin | Shared policy and runtime foundations; Harsh consumes the exported helpers |
| `backend/core-api/src/commands/**`, `queries/**` | Akhin | Authoritative command/query entry points, including canonical writes and public-safe projections |
| `backend/core-api/src/modules/trips/http/**` | Harsh | Calls the established trip/member commands; does not implement a second membership authority |
| `backend/core-api/src/modules/conversations/**`, `modules/notifications/**` | Harsh | Use the established transaction, recipient-policy, idempotency and event helpers; Akhin reviews isolation/order/retry behavior |
| `backend/core-api/src/modules/discovery/http/**`, `modules/guides/**` | Harsh | Consume Akhin's scoring/public projection contracts; no independent scoring or raw private joins |
| `backend/core-api/src/providers/maps/**`, `providers/places/**` | Harsh | Implement normalized provider adapters; shared credential/network policy belongs to Akhin |
| `backend/core-api/src/modules/media-catalogue/http/**` | Harsh | Delegates to Akhin's asset/consent/job commands |
| Remaining Core domain modules, including itinerary, branches, passports, matching, location, contacts and moderation | Akhin | Kabeer and Harsh submit contract requests rather than editing the same module |
| `packages/contracts/**` and generated bindings | Akhin | Other owners propose a schema change; Akhin updates the source and regenerates both languages together |
| `data-model/schema.sql`, `migrations/**`, `seed/canonical/**`, `DATA_MODEL.md` | Akhin | Exactly one migration owner. Preserve canonical IDs, field names and original data |
| `data-model/seed/demo/**`, `tests/fixtures/demo/**` | Harsh | Uses the approved schema and fixture helpers; no real secrets, contacts or private photos |
| `tests/e2e/**`, frontend tests, `ai/evals/**` | Kabeer | Browser/AI outcome checks |
| `tests/integration/core/**`, `tests/integration/media/**`, Media tests | Akhin | Decision concurrency, privacy, jobs, canonical conformance and Media correctness |
| `tests/integration/http/**`, `tests/smoke/backend/**`, provider-adapter tests | Harsh | Tests for his HTTP adapters and deterministic provider normalization |
| Core package manifest/config/bootstrap, root workspace/lockfile, Docker/CI and `.env.example` | Akhin | Serialize edits; other owners send the needed dependency/config delta with their PR |
| Trippy package metadata | Kabeer | Akhin integrates any root Docker/workspace changes |
| Media package metadata | Akhin | Harsh does not add model/runtime dependencies |
| `README.md`, `docs/PRODUCT.md`, `docs/DEMO.md`, final demo copy | Kabeer | Other owners provide exact tested commands/results in PR descriptions |
| `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/IMPLEMENTATION_PLAN.md` | Akhin | Kabeer reviews product-visible behavior changes |
| `docs/BACKEND_QA.md` | Harsh | Reproducibility, fixture inventory and backend verification evidence |
| `docs/TEAM_BUILD_PLAN.md` | Kabeer | Record explicit task transfers here; do not create competing versions |

### Shared-file rules

1. Work from separate branches and separate checkouts/worktrees. Two agents must not edit the same shared working tree concurrently.
2. Do not use the root lockfile as an informal collaboration surface. PR-01 reconciles the existing npm landing with the documented pnpm workspace once; Akhin owns later workspace-lockfile updates. Before that migration, the checked-in npm commands remain valid.
3. Core's bootstrap registers module plugin interfaces established in PR-01. Harsh replaces the owned module implementation behind those interfaces; he does not repeatedly edit Core's entrypoint. Unimplemented modules return an explicit unavailable response, never fabricated success.
4. A module owner can request schema changes, but only Akhin authors/renumbers migrations and generated contracts. Request these before building code that depends on them.
5. If a PR needs a shared file, agree its exact hunk with the owner and serialize that edit. Review is not permission to overwrite unrelated work.
6. No mass renames, repo-wide formatting or dependency upgrades while other owners are integrating. Keep formatting inside owned files.
7. Root documentation and shared integration changes are collected in the relevant owner's PR rather than being edited by all three at once.

### Existing landing decisions to retain

The landing currently uses React/JSX, plain CSS and requestAnimationFrame/CSS 3D motion. The target architecture mentions TypeScript and GSAP. Kabeer may migrate application code to TypeScript incrementally in PR-03; the working door animation does not require a GSAP rewrite. Akhin records this implementation choice in A02 during PR-01. The design remains the submitted deck's oat/charcoal/terracotta palette, with the current larger typography.

## 4. Rules none of the workstreams may change independently

- One immutable published change set, with one or more canonical proposal entries. Ballots are counted once per person and mirrored to canonical votes per entry.
- Frozen eligible electorate; threshold `floor(N/2)+1`; no automatic proposer vote; silence is not approval; deadline expiry alone never passes a proposal.
- A passing vote applies the entire change set, locks affected logical items, advances the itinerary version and records history/outbox in one transaction. No accepted-but-unapplied state.
- Organizer, participant and Trippy cannot directly change a committed item. Canonical `locked` retains its supplied optimizer meaning; `decision_locked` represents decision authority.
- V1 uses the documented strict base-itinerary-version check. Changed/stale proposal contents need fresh voting. Do not invent silent rebasing in the frontend or agent.
- Public/private groups, guide availability, private enquiry recipients, Passport visibility and location/contact grants follow PRODUCT.md. Authenticated does not mean authorized.
- Trippy can search, draft and publish proposals; it cannot vote, unlock, remove members or read emergency contacts through chat.
- Core validates normalized provider data and private constraints. Neither an LLM nor a provider response determines who is allowed to change a plan.
- Missing preferences, prices, venue policies and availability remain unknown. Matching scores are the documented heuristic and coverage calculation, not invented percentages.
- Photo reference matching stays consented and trip-scoped. No gender inference from names/photos. Public women representation uses the specified consenting self-description count and active-member denominator.
- Existing local previews remain labeled until replaced by real shared state. A UI that looks live is not the mandatory two-browser proof.

## 5. Planned PR register

**Dependencies below are merge/integration prerequisites.** A person can prepare isolated code against approved contracts earlier, but cannot mark that PR verified using only mocks. Numbers are stable task identifiers; they are not a forced numerical merge order. For example, PR-11 can merge before PR-07 once its own prerequisites are ready.

| Planned PR | Owner / reviewer | Deliverable | Required predecessors | Implementation mapping |
|---|---|---|---|---|
| PR-01 | Akhin / Kabeer | Workspace, service skeletons, contract source, module interfaces, CI/build plumbing | Current master | I00–I02 |
| PR-02 | Akhin / Kabeer | Canonical schema, auth/RBAC, command foundation and trip/member primitives | PR-01 | I03–I05 foundations |
| PR-03 | Kabeer / Akhin | Signed-in mobile shell, real session adapter and reusable UI/API clients | PR-01, PR-02 | I01, I04, I08 shell, I20 |
| PR-04 | Harsh / Akhin | Trip, invitation, join-request and member HTTP adapters | PR-02 | I05 |
| PR-05 | Akhin / Kabeer | Atomic votes, itinerary revisions, decision locks and history | PR-02, PR-04 | I06 |
| PR-06 | Akhin / Kabeer | Jobs, expiry, outbox, realtime, scoped internal service API | PR-05 | I07 |
| PR-07 | Kabeer / Akhin | Live trip UI, proposals/votes/history and two-browser hard proof | PR-03, PR-04, PR-05, PR-06 | I08–I09 |
| PR-08 | Harsh / Akhin | Persisted chat, private enquiries and in-app notification backend | PR-04, PR-06 | I12 backend |
| PR-09 | Akhin / Kabeer | Global/trip Passport, Genome, deterministic ranking and public projections | PR-02, PR-04, PR-06 | I10–I11 domain |
| PR-10 | Harsh / Akhin | Discovery and guide HTTP endpoints, filtering and pagination | PR-09 | I11 HTTP |
| PR-11 | Harsh / Akhin | Places/Maps/Routes normalized provider adapters | PR-01, PR-02 | I13/I15 provider subtask |
| PR-12 | Kabeer / Akhin | Passport forms/review, discovery, enquiries and group-chat UI | PR-03, PR-08, PR-09, PR-10 | I10–I12 UI |
| PR-13 | Kabeer / Akhin | Real Trippy service, scoped tools, grounded chat answers and extraction | PR-06, PR-08, PR-09, PR-11, PR-12 | I13 |
| PR-14 | Kabeer / Akhin | Interactive text/voice onboarding and reviewed AI-context import | PR-13 | I19; completes P02 with PR-12 |
| PR-15 | Akhin / Kabeer | Alternative branches, merge bundles and excursion/reunion domain rules | PR-05, PR-06, PR-09, PR-11, PR-13 | I14, route-validation part of I15 |
| PR-16 | Akhin / Kabeer | Location grants, contact security, check-ins, reports and blocks | PR-06, PR-08, PR-09 | I16 domain; reusable before map UI |
| PR-17 | Kabeer / Akhin | Branch/consensus UX, maps, live location and participant-safety UI | PR-07, PR-12, PR-13, PR-15, PR-16 | I14–I16 integration |
| PR-18 | Akhin / Kabeer | Media service, scoped assets/jobs, face matching and collage pipeline | PR-02, PR-04, PR-06 | I17 |
| PR-19 | Harsh / Akhin | Media upload/status/reference/collage HTTP adapters | PR-18 | I17 HTTP |
| PR-20 | Kabeer / Akhin | Shared album, reference review and collage-export UI | PR-03, PR-18, PR-19 | I18 |
| PR-21 | Harsh / Akhin | Repeatable fixtures, backend smoke checks and QA runbook | PR-04, PR-08, PR-10, PR-11, PR-19 | I21/I23 support |
| PR-22 | Akhin / Kabeer | Backend/worker deployment, operations and hosted verification | PR-06, PR-13, PR-15, PR-16, PR-18, PR-19 | I22 backend; skeleton deployment begins after PR-02 |
| PR-23 | Kabeer / Akhin; Harsh reproduces | Final frontend release, complete browser journeys and submission handoff | PR-07, PR-12, PR-14, PR-17, PR-20, PR-21, PR-22 | I20–I23 final acceptance |

**Allocation:** Kabeer 8 planned PRs; Akhin 9; Harsh 6 smaller backend/support PRs. These counts measure work packages, not equal effort. PR-01/02/05/06 are unusually important because later work depends on their contracts and correctness.

## 6. What goes into each PR

### PR-01 — Akhin: shared foundations and contracts

Branch: `akhin/pr-01-foundations`.

- Preserve the running frontend. Establish the documented workspace and independently runnable Core, Trippy and Media skeletons. Owners implement service behavior in later PRs.
- Define IDs, money/time formats, DTOs, error shapes, expected revisions, event envelopes, jobs/leases, internal capabilities and tool schemas under `packages/contracts`.
- Establish plugin registration interfaces and ownership handoff for Harsh's modules. Include shared transaction, authorization and provider-adapter interfaces; avoid making him infer them from prose.
- Establish package scripts, generated bindings, `.env.example`, CI, service ports and health/readiness conventions. Configuration must describe unavailable integrations truthfully.
- Publish validated fixture payloads for frontend and worker development. Reconcile the actual landing's CSS motion implementation with architecture A02.

Done when: each owner can build their skeleton and validate the same example payloads. No other feature PR introduces a competing schema or package-manager strategy.

### PR-02 — Akhin: data, identity and trip command foundation

Branch: `akhin/pr-02-data-auth`.

- Import/audit canonical data, add versioned extension migrations and implement auth UUID → canonical user mapping. Keep canonical seeds separate from fresh demo identities.
- Implement named authorization policies, least-privilege database access and command-function ownership. Add service credential/capability validation interfaces needed by PR-06.
- Provide the trip/member primitives Harsh needs: create trip and initial itinerary, issue/redeem/revoke invite, request/review admission, list/read authorized trip/member state, leave/remove and transfer ownership. Recheck capacity/roles atomically; preserve removal/re-entry rules.
- Define scoped conversation/media schemas and public-safe query interfaces; do not expose raw private tables merely to unblock another owner.
- Supply fixture/import helpers for Harsh and initial conformance validation. D1–D9 mapping remains explicitly unresolved until the organizers provide it.

Done when: two real accounts map to different canonical users; command-level admission/role tests pass; capacity and private access cannot be bypassed. Harsh receives callable primitives, not a request to invent membership security.

### PR-03 — Kabeer: real app shell

Branch: `kabeer/pr-03-app-shell`.

- Keep the warm landing and its larger typography. Add signed-in routing, navigation, trip shell, reusable forms/cards/dialogs, error/loading states and responsive layouts.
- Integrate real Supabase sessions and the generated Core client. Implement refresh, logout, session expiry and accessible mobile navigation.
- Establish TanStack Query/cache keys and the frontend subscription adapter interface. Core remains authoritative; temporary UI fixtures stay clearly marked.
- Adopt TypeScript incrementally for new application modules without blocking the already working landing.

Done when: real sessions survive refresh, signed-out and signed-in routes work, and each upcoming feature has a stable UI/API integration point.

### PR-04 — Harsh: trip HTTP surface

Branch: `harsh/pr-04-trip-http`.

- Implement schema validation, HTTP status/error mapping and route handlers around PR-02's existing trip/member primitives.
- Cover create/read trips, settings, invites, join-code redemption, join requests/review, member listing, removal/leave and ownership transfer as defined in A12.
- Use session-derived identity and established policy helpers. Do not accept a caller-selected actor or write canonical membership tables directly.
- Add HTTP tests for invalid/expired codes, repeated submissions, full trips, missing membership, participant role escalation and removed-user re-entry.

Done when: the frontend can create and join a real private/public trip through the HTTP API, and Akhin's command errors remain intact. No frontend files change.

### PR-05 — Akhin: decision engine

Branch: `akhin/pr-05-decision-engine`.

- Implement change-set publication, frozen electorate, explicit ballots, canonical proposal/vote mirroring, expected revisions and immutable payload hashes.
- Implement the normative A05 transaction, strict stale-base behavior, logical item lineage, replacements/removals, decision locks, history and exact costs.
- Enforce direct-edit refusal for all roles. Preserve canonical `locked` semantics separately.
- Test simultaneous decisive votes, retry after commit, idempotency-key mismatch, rollback halfway through a bundle, stale proposals and forbidden post-finalization voting.

Done when: backend tests demonstrate one atomic commit/version increment with retained history. No UI or model decides the outcome.

### PR-06 — Akhin: runtime and internal service boundary

Branch: `akhin/pr-06-realtime-jobs`.

- Implement leased durable jobs, lease generations, expiry scheduling, retries/cancellation and Core worker startup.
- Implement transactional outbox, private broadcasts, membership access epochs, snapshot/reconnect sequences and the authenticated ephemeral socket foundation.
- Expose the scoped job/asset/tool APIs for Trippy and Media. Provide Core handlers for existing get-context, preview and publish-proposal tools; later PRs add branch/asset operations without relaxing scope.
- Export the chat event, transaction, recipient-policy and notification interfaces needed by Harsh. Give provider tools a stable adapter registration point for PR-11.
- Verify revocation with an already-open subscription and a previously claimed job. Fenced-out workers cannot write late results.

Done when: a committed change broadcasts correctly, server expiry works without browsers, reconnect recovers gaps, and services cannot choose their own actor/trip scope.

### PR-07 — Kabeer: the required real collaboration experience

Branch: `kabeer/pr-07-live-decisions`.

- Wire trip creation/joining and the mobile agenda/desktop plan to actual Core state.
- Add proposal forms/previews, votes, deadlines, locks, history and visible superseded items. Dragging a locked item opens a proposal.
- Implement subscribe/buffer/snapshot recovery and consistent Plan/History/decision-card identities.
- Add the real Playwright hard proof: three eligible members, two browser sessions, second yes commits and locks in both, direct API edits fail, and history shows the votes. Include reconnect and replacement retention.

Done when: the exact mandatory outcome works without localStorage tricks or manual refresh. This is the first integrated milestone the team rehearses together.

### PR-08 — Harsh: chat, private enquiries and notifications

Branch: `harsh/pr-08-chat-http`.

- Implement the owned conversation/notification modules using PR-02/06's established policy, transaction and event interfaces.
- Persist ordered messages with `client_message_id` dedupe, pagination and unread/read state. Enquiries have explicit recipients and are separate from trip chat.
- Parse the agreed @Trippy mention format and enqueue its job in the message transaction. Do not call Gemini here or invent a second agent endpoint.
- Connect proposal attachments to change-set IDs; recipients retrieve authorized detail. Use recipient-scoped events for private enquiries.
- Test retries, paging order, outsider access, wrong conversation, organizer handover and membership removal. Schema/function changes go through Akhin.

Done when: stored chat/enquiries are accessible through API with correct isolation. A mock response or in-memory message array does not qualify.

### PR-09 — Akhin: preferences, Genome and matching

Branch: `akhin/pr-09-passport-matching`.

- Implement global/trip Passport storage, provenance, confirmed/missing state, hard/soft preferences and visibility.
- Implement Genome distributions, revision invalidation and public/member projections. Add job handlers without losing schema/lease rules.
- Implement A08's deterministic eligibility, weights, coverage and explanations; use explicit currency/cost basis and unknown states.
- Return public-safe trip/guide query results and consenting women counts/percentage without disclosing hidden member fields.
- Register authorized preference/context/extraction-review operations for PR-13. Candidate extraction does not save itself.

Done when: repeatable inputs produce repeatable explained scores; private data stays private; candidate previews do not mutate membership or the Genome.

### PR-10 — Harsh: discovery and guides

Branch: `harsh/pr-10-discovery-http`.

- Expose PR-09's discovery/public-card projections with validated filters, stable pagination and the agreed response schema.
- Add guide catalogue endpoints using canonical city/language/specialization/price fields. Availability stays unknown without a source.
- Return score factors, coverage and representation fields as provided by Core; do not recompute them in the route layer.
- Verify private/full/closed trips, missing preferences, zero results, invalid filters, and non-public member data exclusion.

Done when: Kabeer can build the entire public trip/guide flow from documented endpoint responses. Private enquiries enter the PR-08 conversation API.

### PR-11 — Harsh: provider adapters

Branch: `harsh/pr-11-place-adapters`.

- Implement the agreed `searchPlaces`, `getPlaceDetails` and `estimateRoutes` adapter interfaces behind Core, with server-only credentials.
- Normalize identifiers, coordinates, hours, phone, website, supported pet/accessibility fields and route estimates. Distinguish absent from false. Preserve source/freshness/attribution metadata.
- Handle field masks, timeout, quota errors and configured cache policy. Start with recorded provider-shaped fixtures; final live verification needs actual configured accounts.
- Do not build an open arbitrary-URL fetch proxy. Akhin owns the network restrictions used by Kabeer's source-retrieval workflow; untrusted sources cannot add permissions.
- Add deterministic adapter tests and one documented real provider request once keys exist. Report unavailable capability honestly until then.

Done when: Trippy and the map consume the same stable adapter results. No browser code, LLM prompts or matching policy changes.

### PR-12 — Kabeer: matching and conversations in the app

Branch: `kabeer/pr-12-discovery-chat-ui`.

- Build global/trip Passport forms, skip flow and extraction-review UI; keep missing data distinct from confirmed data.
- Wire public discovery, score breakdown, Passport/Genome comparison, guide cards, representation disclosures and admission flow.
- Build private organizer enquiries, persistent group chat, mentions, notifications and live proposal cards. Private enquiries never render inside the trip conversation.
- Verify phone keyboards, list pagination, connection/errors, and permission changes while the screen is open.

Done when: a solo user can discover, enquire, request admission and participate in real chat; an existing group can use the same app privately.

### PR-13 — Kabeer: Trippy service and grounded tools

Branch: `kabeer/pr-13-trippy`.

- Implement SVC-03 job execution and the reusable `ai/` pipeline, versioned prompts and model/tool contracts.
- Use Core's bounded tool dispatcher and capabilities. Implement cancellation, retries, streamed statuses, source links and persistent final replies.
- Exercise search/details/routes, trip context, change preview and proposal publication. Respect provider tool-combination limits of the actual accessible model.
- Implement AI-context candidate extraction and grounding/source retrieval through the approved network adapter. Private contacts/biometrics never enter ordinary model context.
- Add bounded evals for valid proposals, unknown venue policy, injected source instructions, wrong trip, removal mid-run, stale plan and impossible schedule.

Done when: a real @Trippy question gives a sourced answer and a real requested change becomes a proposal that humans vote on. Branch tools are completed jointly with the domain/UX integration in PR-15/17.

### PR-14 — Kabeer: complete optional onboarding

Branch: `kabeer/pr-14-voice-onboarding`.

- Complete pasted AI-context → reviewed candidates → Passport; interactive text follow-ups; and the skip path.
- Add authenticated ephemeral Live sessions, interruption, transcript review, microphone permission/error handling and text fallback.
- Persist only reviewed fields through Core. No permanent model key reaches the client and no client-reported tool result becomes a commit.
- Check English/Hindi/Hinglish corrections, budget/currency ambiguity, expired sessions and declined microphone access.

Done when: all three onboarding routes work end to end against the configured services. Voice availability does not block basic trip discovery.

### PR-15 — Akhin: branches, merges and excursions

Branch: `akhin/pr-15-branch-domain`.

- Implement editable alternative branches, base/draft revisions, diffs and all-or-nothing merge proposals.
- Implement excursion participants, branch activities, departure/reunion and shared-cost effects. Keep alternative drafts distinct from real subgroup outings.
- Validate time/route/cost constraints using normalized provider evidence. Missing evidence remains unresolved. Whole-trip electorate is used for shared changes in v1.
- Register Core's branch tool handlers. Kabeer implements their Trippy use and user-facing consensus comparison in PR-17.
- Test stale merge, revision conflicts, partial-bundle failure, reunion infeasibility and member retention.

Done when: only a passed merge changes the main plan, history survives, and subgroup plans cannot silently drop inconvenient members.

### PR-16 — Akhin: location and participant controls

Branch: `akhin/pr-16-location-privacy`.

- Complete location grant/expiry/revoke commands and authenticated socket ingestion/fan-out, including stale/accuracy/sequence rules.
- Implement encrypted emergency contacts, named-recipient access requests/grants and access audit. Roles alone do not grant contact access.
- Implement check-ins, reports and blocking with the existing admission/matching integration. External escalation is disabled unless its provider/consent are configured and tested.
- Revoke future access on removal; reject revoked run/job capabilities and private reads. Native background tracking is not claimed by the web app.
- Test late packets, open connections, grant expiry, removed members, private enquiry boundaries and the agent's inability to read contacts.

Done when: backend controls work independently of whether the map UI is open. Full user-facing I16 acceptance waits for PR-17.

### PR-17 — Kabeer: branches, maps and safety screens

Branch: `kabeer/pr-17-trip-coordination`.

- Build alternative/merge previews, consensus comparisons and excursion/reunion views with a clear mobile representation.
- Finish Trippy branch-tool integration using PR-15. Route suggestions remain previews until their proposal passes.
- Render actual map stops, travel legs, branches, meeting points and authorized foreground positions. Separate planned from reported locations and show freshness.
- Build location sharing/stop, manual check-in, emergency-contact requests/grants, member removal controls and report/block UI against PR-16.
- Test the real fork → review → vote → merge and permission-revocation journeys with Akhin.

Done when: branch/map/chat/plan share committed state and participants can understand and control location/contact sharing.

### PR-18 — Akhin: real Media pipeline

Branch: `akhin/pr-18-media-pipeline`.

This work is independent of the Trippy/branch lane once PR-02/04/06 are ready. Do not unnecessarily queue it behind PR-15/16.

- Implement Core's scoped signed-asset, consent, metadata, reference and job primitives; SVC-04 consumes narrow capabilities, not general DB credentials.
- Implement real image decoding/validation, orientation, derivative GPS removal, thumbnails, YuNet detection, SFace embeddings and trip-scoped reference matching.
- Pin model versions/checksums; use consented positive/negative examples to choose thresholds; preserve manual corrections and unknown states.
- Implement real Pillow collage rendering, private output storage and job progress/results. Validate current membership/consent and lease generation at completion.
- Test revoked consent, late workers, duplicates, bad/large files, zero/multiple faces, false matches and cross-trip denial.

Done when: actual photos produce candidate results and a downloadable collage. Harsh receives the domain primitives needed for PR-19.

### PR-19 — Harsh: Media HTTP surface

Branch: `harsh/pr-19-media-http`.

- Wrap PR-18's upload authorization/completion, job status, reference submission, match review and collage commands in documented authenticated endpoints.
- Validate input sizes/types/status transitions and map errors. Delegate signed paths, consent and ownership decisions to the domain layer.
- Test outsider access, wrong trip/media ID, invalid completion, duplicate requests, expired URLs and removed membership.
- Do not modify models, thresholds, embeddings, storage policy or worker execution.

Done when: the frontend can upload and consume actual Media results solely through the agreed HTTP contracts.

### PR-20 — Kabeer: memories experience

Branch: `kabeer/pr-20-memories-ui`.

- Build batch uploads/progress/retry, album browsing and expiring signed-image recovery.
- Add reference consent, face selection, candidate review, correction and honest zero-result states.
- Add collage selection/layout, async progress, actual preview/download and consent/reference deletion controls.
- Verify interrupted uploads, narrow screens, permission removal mid-job and real exported images.

Done when: a participant can upload photos, find reference-person candidates, correct them and download a collage without developer intervention.

### PR-21 — Harsh: reproducible backend verification

Branch: `harsh/pr-21-backend-qa`.

- Maintain demo fixtures as schema-compatible synthetic data with current demo deadlines; never rewrite historical canonical seed records.
- Add rerunnable backend smoke scripts using documented endpoints and safe demo credentials provided through the environment, not committed secrets.
- Cover create/join, permissions, chat, discovery, provider status, photo jobs and required error cases. Invoke existing authoritative tests/conformance tools instead of duplicating their logic.
- Write `docs/BACKEND_QA.md`: exact commands, prerequisites, fixture IDs, expected outcomes, actual results and unresolved failures.
- Begin fixture preparation after PR-02; final acceptance waits for the listed feature dependencies. During blocked periods, reproduce/report failures in owned tests rather than editing frontend or shared schema.

Done when: a teammate can repeat the backend checks from a clean setup. Tests prove actual domain effects; HTTP 200 alone is insufficient.

### PR-22 — Akhin: deployed services and recovery

Branch: `akhin/pr-22-backend-release`.

- Deploy an early Core/auth skeleton after PR-02, then integrate the completed Core worker, Trippy and Media processes.
- Own host/runtime configuration, controlled migrations, secret separation, storage/broadcast policy, HTTPS/CORS, readiness and queue/provider observability.
- Verify workers stay alive on the actual host, reconnect/restart recovery works, and key restrictions fit the deployed frontend origin.
- Capture backend concurrency/privacy/conformance results and a compatible rollback procedure. Do not claim unused provider integrations as configured.

Done when: real independent devices can use the hosted domain services and jobs complete with the same correctness as local development.

### PR-23 — Kabeer: integrated release and submission

Branch: `kabeer/pr-23-integrated-release`.

- Finish frontend deployment and mobile/accessibility polish without changing established backend contracts.
- Run actual private-group and solo-discovery journeys, Trippy proposals, fork/merge, maps/grants and photo retrieval/export. Repeat the mandatory two-browser hard proof on the hosted URLs.
- Update the README's eight required sections, actual feature status, setup commands, demo path and known limits. Add `docs/DEMO.md` and measured evidence; do not report target latencies as measurements.
- Harsh follows the runbook from a clean checkout. Akhin owns backend fixes; Kabeer owns UI/agent fixes. Re-run the checks affected by a fix.
- Record the tested commit and deliver through the actual organizer submission channel. This work package assigns responsibility; it is not an instruction for an assistant to submit externally without the team's request.

Done when: another team member can run the project and reproduce its claimed outcomes. An unavailable feature is disclosed, and the mandatory proof has no unresolved correctness failure.

## 7. Immediate execution order and parallel lanes

### Start now

| Kabeer | Akhin | Harsh |
|---|---|---|
| Pull master; preserve the landing; prepare signed-in screen composition and Trippy/voice interaction contracts. Own Gemini/model and frontend/Maps-browser account setup with the team. | Start PR-01 immediately. Own Supabase/database/Auth, canonical data access, shared contracts and backend hosting setup. Then PR-02. | Inspect the supplied canonical pack and HACKATHON.md, prepare a fixture inventory and endpoint/error test cases, and prepare provider-shaped adapter fixtures. Request any missing source files; do not invent canonical records or routes. |

No one has to wait idle for accounts. Isolated skeletons, fixture contracts and UI components can progress, but provider-dependent features are not complete until exercised against configured services. Account/key handling stays out of prompts and Git.

### First integrated milestone

1. Akhin merges PR-01. All three pull once and agree the published contracts.
2. Akhin completes PR-02. Kabeer builds PR-03; Harsh builds PR-04. Harsh can also prepare PR-11's pure adapter/fixture code.
3. After trip HTTP works, Akhin completes PR-05 then PR-06. Kabeer prepares the decision UI against the approved payloads and integrates it in PR-07.
4. All three run the real two-browser proof. **Do not replace this with the existing landing's local vote demo.**

### Product-completion lanes after the foundation

- **Kabeer:** PR-07 → PR-12 → PR-13. PR-14 (voice), PR-17 (coordination) and PR-20 (memories) can be ordered by which Akhin/Harsh dependencies are actually ready. PR-23 closes the integrated product.
- **Akhin:** PR-09 unlocks matching/agent context. Prepare PR-18 early enough that photos do not become the final-hour surprise. PR-15 follows the Trippy/provider path; PR-16 provides privacy controls. PR-22 evolves from an early deployed skeleton into the final backend release.
- **Harsh:** PR-04 → PR-08/PR-11 → PR-10 → PR-19, choosing the ready task. Prepare PR-21 fixtures continuously and verify them once endpoints exist. Ask Akhin for missing helpers/contracts rather than writing a parallel authority.

The arrows describe an individual's practical queue, not extra dependencies. The register remains authoritative. Backend submodules such as provider adapters, grants and Media can be implemented ahead of the full UI feature's I-step; final integrated acceptance still follows IMPLEMENTATION_PLAN.md.

### If someone is blocked

- Missing contract or schema: Akhin handles the smallest enabling change; the requesting owner supplies a concrete input/output/error example.
- Missing frontend endpoint: Kabeer can finish layout against labeled contract fixtures; cannot claim the flow works end to end.
- Missing provider access: Harsh finishes deterministic normalization/error checks; Kabeer/Akhin arrange the actual account/key setup. Keep the provider marked unavailable.
- Harsh blocked by command availability: switch to provider fixtures or QA, not voting logic or frontend.
- Akhin overloaded: Harsh can take an additional route adapter or fixture package; Kabeer can take Media-worker implementation **only after an explicit ownership transfer** covering its entire directory. Never have both edit it at once.
- Feature failing near submission: fix the mandatory decision proof first, then report the actual state of other features. Do not silently lower the product specification or fill gaps with false live behavior.

## 8. PR workflow and review contract

For a new independent branch:

```sh
git switch master
git pull --ff-only origin master
git switch -c <owner>/<planned-pr-id>-<short-description>
```

Use a separate worktree/checkout for concurrent tasks. If an implementation must stack on an unmerged dependency, record the dependency/base explicitly; retarget or rebase after that dependency merges. Do not merge a dependent PR before its predecessor exists on master.

Every PR description includes:

1. Planning ID and actual GitHub link, owner/reviewer, predecessors and P/I/A references.
2. Concrete before/after behavior and owned paths changed.
3. Contract/database/environment changes, with the responsible shared-file owner.
4. Exact checks run and observed results, including negative cases.
5. Known limits, provider configuration status, and whether any fixture/mock remains.

Akhin reviews Harsh's backend PRs. Kabeer reviews Akhin's API/behavior against the product and reproduces relevant integration checks. Akhin reviews Kabeer's AI/authorization boundaries and frontend API use. For security/concurrency work, human review is supported by actual negative/concurrent tests, not by assuming either model is infallible.

Merge one shared-foundation/schema PR at a time. Fetch/rebase before final checks; never force-push master. PR authors fix their own review comments. If code must move to another owner, explicitly transfer the task and update this document.

## 9. Coverage check: nothing falls between owners

| Product capability | Kabeer's implementation | Akhin's implementation | Harsh's implementation |
|---|---|---|---|
| P01 Landing/auth/mobile | PR-03, PR-23; existing landing retained | PR-01/02 auth/contracts | No frontend assignment |
| P02 Import/text/voice/skip | PR-12/13/14 | PR-09 storage/review permissions | Provider support only |
| P03 Trip lifecycle and RBAC | PR-03/07/12 screens | PR-02 authoritative commands | PR-04 HTTP/tests |
| P04 Trip Passport/Genome | PR-12, PR-17 views | PR-09 derivation/privacy | PR-10 public response adapter |
| P05 Discovery/guides/representation | PR-12 | PR-09 scoring/projections | PR-10 endpoints; PR-11 evidence |
| P06 Shared itinerary | PR-07 | PR-05/06 | PR-04 setup; PR-21 smoke reproduction |
| P07 Commit/lock/history | PR-07 hard proof and PR-23 hosted proof | PR-05/06 authority/transactions | PR-21 reproduces, does not redefine |
| P08 Chat/enquiries/notifications | PR-12 | PR-02/06 policies/runtime | PR-08 |
| P09 Trippy | PR-13 | PR-06 scoped dispatcher; PR-09 context | PR-08 mention job; PR-11 provider adapters |
| P10 Fork/merge/consensus | PR-13/17 agent and UX | PR-15 domain validation/merge | PR-11 normalized route evidence |
| P11 Excursions/reunion | PR-17 | PR-15 | PR-11 evidence |
| P12 Maps/location | PR-17 | PR-15 validation; PR-16 sharing authority | PR-11 provider adapter |
| P13 Contacts/check-ins/report/block | PR-17 | PR-16 | PR-21 negative-case reproduction |
| P14 Photos/face matching/collage | PR-20 | PR-18 | PR-19 HTTP; PR-21 fixtures/smoke |
| P15 Reliability/deploy/docs | PR-03/07/23 | PR-01/02/05/06/22 | PR-21 |

### Wider vision remains assigned, without expanding this build silently

P16–P18 remain the product's expansion track, as in the existing specifications. They are not missing from the division and are not counted as delivered in PR-23:

- **P16 / E01 group formation:** Akhin owns opt-in intent/cohort/eligibility state; Kabeer owns the formation UX and agent proposals; Harsh implements bounded invitation/status endpoints after the contracts exist.
- **P17 / E02 activity-level/group joining:** Akhin owns scoped membership/capacity/electorates and privacy; Kabeer owns the publishing/joining experience; Harsh implements the approved enquiry/admission HTTP adapters.
- **P18 / E03 saved wishes:** Akhin owns consented matching jobs and retention; Kabeer owns saving, suggestions and reviewed preference updates; Harsh implements pagination/notification adapters.

Create expansion PR planning IDs only when the team explicitly starts that track. The current numbered register is for the full P01–P15 build.

## 10. Copy-paste brief for each person's coding assistant

### Kabeer

> Work in kognivera-org/kv-hack2026-pacmen. Read docs/TEAM_BUILD_PLAN.md and the linked product, architecture and implementation documents. I own frontend, Trippy/ai, browser tests and final product integration. Keep the existing warm Convia design, larger typography and 3D temple sequence. Start with my next dependency-ready planned PR. Use the shared generated contracts. Do not change Core, schema, lock rules or provider truth to make a UI appear complete. Keep unfinished integrations explicit. Report the branch, changed files, checks and exact API needs to the other owners.

### Akhin

> Work in kognivera-org/kv-hack2026-pacmen. Read docs/TEAM_BUILD_PLAN.md and its linked specifications. I own Core authority, schema/contracts, auth, decisions, realtime/jobs, matching, branches, privacy, Media and backend deployment. Start PR-01 then PR-02 so the other two can build against stable helpers and payloads. Preserve canonical schema semantics and atomic vote-to-commit rules. Give Harsh concrete module interfaces and bounded tasks, and keep frontend/Trippy application code with Kabeer. Test concurrency, revocation, stale versions and actual persisted effects. Report enabling contracts and merge-ready predecessors promptly.

### Harsh

> Work in kognivera-org/kv-hack2026-pacmen. Read docs/TEAM_BUILD_PLAN.md, then only the architecture/API sections relevant to my assigned planned PR. I own the specified smaller backend HTTP modules, Maps/Places adapters, demo fixtures and backend QA. Do not edit frontend, CSS, design, shared migrations/contracts, decision transactions, scoring policy, cryptography or face models. Use Akhin's command/policy interfaces exactly; if one is missing, report the missing signature with a request/response example. Implement one bounded task at a time, cover listed error cases, and request Akhin's review with exact checks/results. Do not mark mocks as live integration.

The person named as owner remains responsible for the result. These prompts guide tools; they do not replace the dependencies, code review or acceptance evidence above.
