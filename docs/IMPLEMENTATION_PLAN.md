# Convia — Ordered Implementation Plan

Version: 1.0 · 24 September 2026 · Team: pacmen

Status: executable build specification. The standalone frontend and warm temple landing are implemented, contributing partial work toward I01/I20. Production bundling and desktop/mobile browser checks pass for that landing. Backend services and the complete acceptance conditions of the steps below remain pending. Local voting previews are not the I09 hard proof.

Required companions:

- [PRODUCT.md](PRODUCT.md): full user experience and feature IDs P01–P18.
- [ARCHITECTURE.md](ARCHITECTURE.md): normative service IDs, data structures, APIs, decision rules and configuration.

If implementation reveals a necessary contract change, update the architecture, this plan and affected product behavior in the same change. Do not let separate service owners invent incompatible schemas or voting rules.

## 1. Starting state and build contract

- No working Supabase, Gemini, Maps or deployment accounts/keys have been supplied.
- The local WanderMatch package contains canonical SQL/CSV/SQLite data and conformance tooling.
- The existing convia-prototype is React/Vite using localStorage. It provides visual and interaction references; it is not production authentication, multi-device realtime, live AI or live routing.
- The requested application is a fresh implementation in kv-hack2026-pacmen.
- The organizer README contract is available in HACKATHON.md. Its D1–D9 mapping remains missing; do not invent it or stall all local engineering while waiting.
- Coding difficulty is not a reason to replace required functionality with fake behavior. Dependencies, correctness and honest readiness determine ordering.

### Non-negotiable shared behavior

A published proposal/change set captures an immutable ordered payload, frozen eligible electorate, majority threshold floor(N/2)+1 and server deadline. Explicit yes votes reaching the threshold trigger one atomic commit, lock, version increment and history record. Organizers and Trippy cannot bypass this path. Superseded items remain visible. Stale payloads require a new proposal and fresh votes.

Every single proposal uses a wm_change_sets record with one or more canonical proposals entries. A bundle ballot is counted once and mirrored to canonical votes per entry, as specified in architecture A05.

## 2. Service workstreams and ownership

| Workstream | Service | Primary output | Dependencies |
|---|---|---|---|
| Web/design | SVC-01 | Mobile shell, trip screens, realtime cache, landing, photo/map/voice UI | Contracts and Core routes |
| Core/data | SVC-02 | Auth mapping, trips, decisions, history, matching, chats, privacy, jobs and provider adapters | Supabase, schema and contracts |
| Agent | SVC-03 | Trippy tool loop, extraction, consensus and voice setup | Core tool API, model access, jobs |
| Media | SVC-04 | Photo processing, references, matching and collage outputs | Private storage, Core job/asset APIs, pinned models |
| Integration | Shared | Deployments, independent-browser proof, conformance, security and final handoff | All implemented workstreams |

These are human/service ownership boundaries; they do not require a particular number of developers. Work can run concurrently once listed prerequisites are satisfied. Parallel work must use the shared contracts and avoid conflicting edits to migrations or generated schemas.

## 3. Dependency order

The numbered steps are a valid topological build order. A later step may start early when all of its listed dependencies are ready; it does not need to wait for unrelated earlier-numbered work.

| Step | Deliverable | Depends on | Features |
|---|---|---|---|
| I00 | Provider/setup inventory and source baseline | None | All |
| I01 | Repository, tooling, service skeletons | I00 local inventory | P01, P15 |
| I02 | Shared contracts and policy specification | I01 | All |
| I03 | Canonical schema and extension migrations | I02 | All persisted features |
| I04 | Authentication and authorization foundation | I03 | P01, P03, P15 |
| I05 | Trip/member/invite lifecycle | I04 | P03 |
| I06 | Atomic decision engine and history | I05 | P06, P07 |
| I07 | Jobs, outbox, expiry and realtime authorization | I03, I06 | P07, P08, P15 |
| I08 | Working frontend trip/decision flow | I04–I07 | P01, P06, P07 |
| I09 | Mandatory two-browser hard proof | I08 | P07 |
| I10 | Passports, extraction review contracts, Genome | I04, I05 | P02, P04 |
| I11 | Public discovery, scores, guide matching, enquiries entry | I05, I10 | P05 |
| I12 | Persistent chat, enquiry conversations and notifications | I05, I07, I08 | P08 |
| I13 | Real Trippy tools and grounded place answers | I06, I07, I10, I12; Gemini/Maps access | P09 |
| I14 | Alternative branches, consensus and excursions | I06, I08, I10, I13 | P10, P11 |
| I15 | Map, travel legs and voted route suggestions | I08, I13, I14; Maps access | P12 |
| I16 | Live location, emergency-contact grants and reports | I05, I07, I12, I15 | P12, P13 |
| I17 | Media service and real face-processing pipeline | I04, I05, I07; model artifacts | P14 |
| I18 | Photo/reference UI and collage export | I08, I17 | P14 |
| I19 | Interactive voice/text and AI-context onboarding | I10, I13; Live API access | P02 |
| I20 | Temple landing and complete mobile refinement | I01 visual work; I08 onward for integration | P01, P15 |
| I21 | System integration and failure testing | I09–I20 for full-build signoff | P01–P15 |
| I22 | Hosted release validation | Deploy skeleton after I04; final signoff after I21 | P15 |
| I23 | Submission, demo and operational handoff | I21, I22 | All delivered features |
| E01 | Feasible-outing group formation | I10–I13, I16 | P16 expansion |
| E02 | Activity-level and group-to-group joining | I11, I12, I14, I16 | P17 expansion |
| E03 | Saved wishes and opportunity suggestions | I10–I13, I16 | P18 expansion |

Core's mandatory transaction and the first true multi-browser proof should finish before the build is described as a working collaborative app. AI and Media can develop against contract fixtures while that proof is being assembled; their final acceptance requires integration with real Core behavior.

## 4. Step-by-step implementation

### I00 — Establish the source baseline and provision prerequisites

Owner: integration/Core. Architecture: A02, A04, A13, A15.

1. Confirm the new repository root and preserve the old prototype unchanged as reference.
2. Inspect the canonical field definitions, SQL, enums, seed load order and conformance script.
3. Record the current user-supplied mandatory enhancement as the latest decision-rule requirement.
4. Inventory available runtimes, Docker and package managers. Select/pin compatible Node/Python versions.
5. Create team-owned Supabase project and Auth settings. Establish a local Supabase stack for development where available.
6. Create Google AI Studio access and verify one text/model request. List accessible tool-capable and Live model IDs; record the chosen IDs in configuration.
7. Configure Google Cloud project, Maps/Places/Routes APIs, billing and restrictions. Verify a place-details and route request without exposing keys in logs.
8. Select frontend/container hosting accounts and region. Obtain team access through the normal account UI; keep passwords/tokens out of chat and Git.
9. Follow the README contract in HACKATHON.md and obtain the D1–D9 mapping when available. Record missing inputs explicitly in DATA_MODEL.md/README rather than inventing them.
10. Source temple imagery and consented photo test assets; record usage rights. Download/check the actual YuNet/SFace artifacts and licenses before depending on them.

Done when: local tools are known, account/provisioning status is visible, secrets have secure homes, and canonical sources are identified. Local scaffolding can proceed while provider accounts are being completed. AI/Maps/voice live checks remain blocked until their respective access is real.

### I01 — Create the repository and independently runnable service skeletons

Owner: all service owners, one shared tooling owner. Architecture: A02–A03.

1. Create the required frontend, backend, data-model, ai, docs and tests layout shown in A03.
2. Initialize a pnpm workspace for frontend, Core and contracts. Initialize Python projects for Trippy, Media and the reusable ai package.
3. Add pinned dependencies, lockfiles, formatting/linting, TypeScript checking and Python checking.
4. Add /health and /ready endpoints to Core and Trippy; add a worker health/status mechanism for Media and Core jobs.
5. Add configuration schemas and a complete .env.example with only dummy values from A13.
6. Configure .gitignore for real environment files, uploaded photos, biometric artifacts, model binaries where separately downloaded, caches and build output.
7. Add Dockerfiles and compose service definitions. Establish internal service names/ports and browser-accessible URLs.
8. Implement empty frontend routing, design tokens, app shell, error boundary and authentication placeholders backed by the real session adapter when I04 lands.
9. Establish CI for contract generation checks, lint/type checks, unit tests and builds.

Required project scripts to implement here: dev:web, dev:core, dev:core-jobs, contracts:generate, contracts:check, db:migrate, db:seed, test:unit, test:integration, test:e2e, test:conformance, lint, typecheck and build. Python service commands must be documented alongside these scripts. These script names are required outputs, not commands that already exist.

Done when: each process starts independently, reports meaningful readiness, and a clean checkout has documented dependency installation and startup commands.

### I02 — Freeze transport contracts and domain policy before parallel features

Owner: Core/contracts, reviewed by web/Agent/Media. Architecture: A05, A06, A12.

1. Define shared schemas for IDs, decimal-money pairs, instants/dates, pagination, revisions and error envelopes.
2. Define role/capability policies and the exact distinction between public projections and member/private resources.
3. Define typed add/remove/replace/reschedule operations, bundle preview, frozen electorate, ballots, terminal states and history responses.
4. Define event envelope and client as_of_sequence semantics.
5. Define jobs, leases, service capabilities, agent tools and media result payloads.
6. Define Passport candidates/reviewed fields, trip overrides, Genome distributions, match scores/coverage and provenance.
7. Define schemas for chat/proposal attachments, private enquiries, location/contact grants and face consent.
8. Generate TS/Python types from the same schema source; add round-trip sample payload checks and OpenAPI.
9. Document idempotency-key scope and expected-revision behavior.

Done when: all services compile/validate the same representative payloads and can identify an invalid money value, forged actor, unsupported action and missing revision before writing feature code.

### I03 — Import canonical data and add explicit extension migrations

Owner: Core/data. Architecture: A04.

1. Copy canonical SQL/CSV and source metadata into data-model/seed/canonical without modifying supplied IDs or historical dates.
2. Create a repeatable migration ledger and apply canonical SQL in supported order.
3. Import CSVs in the supplied foreign-key load order, preserving decimal values as text until decimal parsing.
4. Audit FK integrity, active-itinerary uniqueness, old open proposal deadlines and cost semantics. Report actual findings; do not assume prose counts are authoritative.
5. Add extension tables from A04 in FK dependency order: identities/settings/membership → preferences → decisions/revisions → events/jobs → conversations/grants → media/agent state.
6. Add indexes for trip membership, open deadlines, active requests, conversation sequence, outbox sequence, job claims and media scope.
7. Add required uniqueness constraints, including one ballot per decision/user, one commit per change set, one logical revision number, and idempotency/dedupe keys.
8. Add command-function owner/runtime roles and revoke broad default table/API privileges. Keep migration credentials separate.
9. Create separate demo fixtures using current timestamps and explicitly marked synthetic identities. Do not alter historical seed proposals to look current.
10. Implement canonical export for the provided SQLite-oriented conformance tool, preserving field formats and IDs.
11. Write DATA_MODEL.md with all 14 named canonical tables, additive records and semantic mappings; leave unresolved D1–D9 mapping clearly identified.

Done when: migrations and seed import run twice safely on a disposable database, reference integrity holds, and canonical export passes the supplied conformance checks. Investigate imported inconsistencies before adding constraints that would fail the migration.

### I04 — Establish real sessions, identity mapping and authorization

Owner: Core/web. Architecture: A06.

1. Configure Supabase Auth for the chosen sign-in method and correct local/hosted redirect URLs.
2. Implement frontend session bootstrap/refresh/logout and authenticated API transport.
3. Implement Core JWT verification and canonical auth-subject mapping.
4. Add bootstrap command for real accounts without re-keying canonical users.
5. Mark any canonical technical profile defaults as unconfirmed/system_default; exclude them from personalization from the first implementation.
6. Implement reusable route policies and database command checks for active membership and app capabilities.
7. Add service credentials and job/run capability validation; ensure these are not accepted as general user tokens.
8. Verify table exposure, RLS and storage access using anon, ordinary member and removed-member contexts.

Done when: two independent authenticated sessions resolve to different canonical users, cannot impersonate each other through request bodies, and cannot access private resources without membership/grants.

### I05 — Implement trips, roles, invitation codes and admission

Owner: Core/web. Product: P03. Architecture: A04, A06, A12.

1. Implement atomic trip creation: trip row, settings, organizer membership, app capabilities, initial active itinerary and history event.
2. Implement public/private mode, capacity, admission settings and safe public preview fields.
3. Implement hashed invite tokens/codes with server expiry, revocation, usage limits and brute-force protection.
4. Implement join request create/withdraw/review. Lock capacity/membership state during acceptance to prevent overfilling.
5. Implement member list, participant removal, leaving, delegated co-organizer capabilities and ownership transfer.
6. Ensure canonical owner/editor/viewer mappings remain legal; ordinary co-organizers cannot change owner privileges.
7. Make old invites insufficient for removed users to silently re-enter. Admission must check blocks/removal state.
8. Emit durable membership events and revoke affected access paths.
9. Implement Create/Join code/My Trips/member-management screens with real API state.

Done when: a separate session joins through both supported admission paths, roles behave correctly, duplicate actions do not duplicate membership, and private trips remain absent from public search.

### I06 — Implement the decision engine, revision model and direct-edit refusal

Owner: Core/data. Product: P06/P07. Architecture: A05.

1. Implement operation validators and deterministic preview generation with exact money, timezone and trip ownership checks.
2. Implement logical activities, canonical-item revision links and decision-lock metadata without changing the original locked field's meaning.
3. Implement change-set publication with canonical child proposals, immutable payload hash, base version, electorate and threshold.
4. Implement cast_ballot_and_maybe_commit with the exact lock order and transaction flow in A05.
5. Mirror bundle ballots to canonical votes with one-person/one-vote semantics; never count the mirrored rows more than once.
6. Implement replacement/reschedule as new canonical IDs plus retained old statuses/snapshots; implement removal as retained status/tombstone history.
7. Implement validation failure, stale, withdrawn, expired and committed outcomes with legal canonical status projections.
8. Restrict canonical mutation privileges to audited command functions. Add direct PATCH rejection for locked items and deny raw table mutation from client roles.
9. Build per-item and per-decision history queries showing each eligible member's vote/nonresponse and commit time.
10. Add API integration tests before wiring sophisticated UI: concurrent decisive votes, duplicate requests including a retry after the original commit, rollback mid-bundle, stale base, changed vote before commit and forbidden fresh vote after commit.

Done when: the backend alone proves all-or-nothing commit, one version increment, server-authoritative locks and retained history under concurrency. No AI code participates in calculating the voting result.

### I07 — Add durable jobs, server deadlines, outbox and authorized broadcasts

Owner: Core/infrastructure. Architecture: A07, A12.

1. Implement job enqueue/dedupe, queue-scoped claim, lease heartbeat, success/failure, backoff, cancellation and terminal failure inspection. Enforce lease generations on results/completion so a reclaimed job's old worker cannot publish late results.
2. Implement the Core jobs process with the same code package and separate runtime command.
3. Schedule proposal expiry durably at publication; run finalization when overdue even with no connected browser.
4. Insert trip events/outbox rows in domain transactions and assign monotonic trip sequences.
5. Configure private database-triggered broadcasts on safe outbox notifications, not raw private rows.
6. Add actual membership/epoch authorization for trip topics and deny arbitrary client broadcasts pretending to be commits. Implement epoch rotation on removal, content-free resubscribe controls, and recipient-scoped private-enquiry/notification channels. Test a removed user with an already open channel; join-time RLS alone is insufficient.
7. Implement authorized snapshot queries with as_of_sequence and event/history recovery.
8. Add notification-delivery and Genome-refresh job types for later modules.
9. Implement Core's authenticated ephemeral socket foundation, heartbeat and room policy hooks. Location payload handling arrives in I16.

Done when: a commit notification is emitted after successful commit, rollback emits no successful decision event, expiry survives process restart, and duplicate jobs/events do not duplicate domain effects.

### I08 — Integrate the live itinerary and voting UI

Owner: web with Core. Product: P01/P06/P07. Architecture: A05, A07.

1. Build typed API clients and TanStack Query keys for trip, itinerary, decisions, members and history.
2. Implement subscribe/buffer/snapshot recovery, event dedupe and refetch after gaps/reconnect.
3. Build the mobile day agenda and desktop calendar from the same canonical data.
4. Add activity proposal forms, preview, voting controls, threshold/deadline display and individual vote state.
5. Display a distinct sending state until Core acknowledges. Do not optimistically display a committed itinerary change before server commit.
6. Show committed lock badges, per-item history, replaced/removed records and actionable stale/expired states.
7. Make drag/reschedule of a locked item open a proposal form; also surface direct-edit refusal from the server.
8. Wire live presence and connection-state indicators.

Done when: two browser sessions see a real live vote and commit, Plan/History agree, and refresh preserves state. This step provides the first useful application before optional provider-dependent features are finished.

### I09 — Automate and rehearse the mandatory hard proof

Owner: integration/Core/web. Product: P07.

1. Create three eligible demo members, with two independent logged-in browser contexts and a threshold of two yes votes.
2. Browser A proposes an activity and casts one yes. Assert no commit, no active item and no false lock.
3. Browser B casts the second yes. Assert both browsers show one committed locked item without manual refresh.
4. Attempt a direct edit as participant and organizer using both UI and raw HTTP. Assert DECISION_LOCKED and unchanged state/version.
5. Open item history and assert proposer, both votes, the third member's nonresponse and commit timestamp.
6. Publish a replacement, pass it, and verify the prior item remains visible as superseded with linked history.
7. Repeat decisive-vote requests and send concurrent votes. Verify one commit/version increment.
8. Disconnect one browser, commit another proposal, reconnect and verify convergence.
9. Verify stale competing proposals, server deadline expiry and unauthenticated/removed-member attempts.
10. Preserve the automated test under tests/e2e/vote-to-commit.spec.ts and backend concurrency tests under tests/integration.

Done when: the exact credit-bearing flow is green on independent sessions against the real backend. A screen recording can supplement this proof, never substitute for the working behavior.

### I10 — Implement global/trip Passports and Genome

Owner: Core/web; Agent prepares extraction adapter later. Product: P02/P04. Architecture: A08.

1. Implement versioned Passport schemas, explicit/inferred/default provenance and per-field visibility.
2. Implement global Passport CRUD and trip overrides with clear hard versus soft preferences.
3. Implement skip onboarding as genuinely missing preferences, while honoring required canonical storage fields through explicitly marked defaults.
4. Build the user-review screen for extracted candidate fields; use contract fixtures only until I13/I19 supplies live extraction.
5. Implement Genome distributions from accepted active members, public/member projections and candidate-preview calculations.
6. Invalidate/recompute on relevant membership and preference events, recording source revisions and freshness.
7. Keep exact private budgets and sensitive field values out of public summaries, events and default agent context.
8. Implement budget cost-basis handling and display unresolved costs instead of misleading per-person totals.

Done when: trip overrides work, incomplete data remains visible as incomplete, Genome responds to accepted membership changes, and public projections reveal only permitted information.

### I11 — Implement discovery, ranking, public cards and guide search

Owner: Core/web. Product: P05. Architecture: A08.

1. Implement public visibility/capacity/admission/date/destination eligibility queries with correct indexes.
2. Implement the versioned factor calculations and evidence-coverage handling defined in A08.
3. Implement deterministic reason generation and distinguish incompatible from needs_confirmation.
4. Build search filters and trip cards, score breakdown, Passport/Genome comparison and public itinerary preview.
5. Add consenting women-count and percentage calculations with active-member denominator, undisclosed count, clear self-description label and an unavailable state for a zero denominator. Never derive gender from photos or names.
6. Add private organizer enquiry entry, connected to the conversation API implemented in I12.
7. Implement guides by city, specialization, language and catalogue price; show availability as unknown without an actual availability source.
8. Test full/private/closed groups, missing preferences, budget currencies, empty searches and score reproducibility.

Done when: a solo user can inspect understandable results and request membership; ranking does not expose private group fields or claim that catalogue guides are booked/available.

### I12 — Implement persisted chat, enquiries and in-app notifications

Owner: Core/web. Product: P08. Architecture: A06, A07, A12.

1. Create trip conversations and explicit-recipient enquiry conversations.
2. Implement ordered messages with client_message_id dedupe, pagination, send failures and reconnect recovery.
3. Add user/Trippy/system/proposal message types and attachment schema.
4. Add @Trippy parsing that creates a durable agent job, initially with clearly unavailable/queued state until I13 is ready.
5. Attach proposal and commit messages to the same change-set IDs used by Plan and History.
6. Implement in-app notifications and unread markers for membership, mentions, votes/commits and jobs.
7. Verify private enquiry access under organizer changes, participant removal and URL guessing.
8. Add report/block entry points and message evidence references without exposing reports publicly.

Done when: chat is real persisted multi-user state, private enquiries are isolated, retries do not duplicate messages and decision cards stay synchronized with the itinerary.

### I13 — Implement Trippy's real tool loop and grounded assistance

Owner: Agent/Core/web. Product: P09. Architecture: A09.

1. Package the ai pipeline, prompt versions and generated tool schemas; instantiate the Google GenAI SDK with verified model IDs.
2. Implement SVC-03 job claim/heartbeat/cancellation and run-state reporting.
3. Implement Core's run-scoped tool dispatcher with the precise allowlist from A09. Recheck membership on every command.
4. Implement Places/Routes adapters in Core with field masks, provider error handling, appropriate attribution and cache policies.
5. Implement permitted public-source search/fetch, network restrictions, citations and absent-field handling.
6. Implement get_trip_context, search/get place, estimate_routes, preview_change_set and create_change_set end to end.
7. Connect chat streaming/status to Core and persist the final response with source/tool references.
8. Make proposed versus committed explicit in wording and cards. The run can complete while voting remains open.
9. Add Passport extraction as a candidate-output task; do not automatically save extracted fields.
10. Add bounded evaluation fixtures: valid add/reschedule, unknown pet policy, wrong trip, prompt injection in a source, removed member, stale plan, retry after timeout and impossible schedule.
11. Exercise English and Hindi/Hinglish. Inspect actual tool payloads and server outcomes, not just fluent model text.

Done when: a live @Trippy question returns sourced place information, a live request creates a valid proposal, and member votes commit it through exactly the same engine as a human proposal. Keys/model access failures remain visible and cannot be replaced by fabricated results.

### I14 — Implement alternative forks, consensus and subgroup excursions

Owner: Core/Agent/web. Product: P10/P11. Architecture: A05, A10.

1. Create editable alternative branch storage with base version, visibility and expected draft revision.
2. Add branch preview UI using the prototype's lane/rejoin ideas, with an accessible mobile representation.
3. Compute merge operations and preview before/after activity, time, cost and participant differences.
4. Publish merges as atomic change-set bundles with visible all-or-nothing voting.
5. Handle stale branches through explicit rebase/review; preserve old branch revisions and never carry old votes to revised contents.
6. Add Trippy tools for draft branch creation/editing and merge proposals.
7. Implement consensus suggestions as validated alternatives with disclosed tradeoffs and unresolved constraints.
8. Add excursion branches with participants, branch itinerary and feasible reunion; keep alternative/excursion types explicit.
9. Use the whole-trip electorate for shared-plan changes in v1. Do not add undocumented subgroup voting shortcuts.
10. Test nested/overlapping visual lanes where supported, shared transport effects, reunion timing and member retention.

Done when: the main itinerary stays unchanged during drafting, a merge applies only after votes, old items remain visible, and a real subgroup excursion can be understood in Plan and Map.

### I15 — Implement actual maps and voted route suggestions

Owner: web/Core. Product: P12. Architecture: A10.

1. Configure the restricted browser map key and server Places/Routes key separately.
2. Render actual coordinates, itinerary stops, selected days and excursion/reunion markers.
3. Add travel mode, route legs, duration estimates and external navigation links.
4. Implement route-preview generation respecting fixed times, opening windows, must-see fields and personal constraints.
5. Convert accepted preview intent into a proposal bundle; do not reorder the canonical plan directly.
6. Add public-safe maps without private accommodation or member coordinates.
7. Handle missing coordinates, provider limits, denied geolocation and unavailable routes honestly.

Done when: map and agenda share the same committed activities, route data is real when advertised as live, and route changes obey P07.

### I16 — Implement location grants, contact access, check-ins and reporting

Owner: Core/web. Product: P12/P13. Architecture: A06–A07.

1. Implement per-trip location grants, recipient scope, expiry, explicit stop and manual check-in.
2. Add browser foreground watchPosition handling with permission, accuracy, observed time and sequence.
3. Implement authenticated Core socket ingestion/fan-out; derive sender from session and recheck grants/membership per update.
4. Show last-updated/accuracy/stale state and clear unauthorized positions on revocation/removal.
5. Test the single-instance socket deployment and document that multi-replica operation requires a shared fan-out/revocation layer.
6. Implement encrypted owner-controlled emergency contacts, named-recipient requests, grant/decline, expiry/revoke and access audit.
7. Add optional timed check-ins. Implement actual external escalation only if the notification provider and consent are configured; otherwise show explicit capability status and manual contact actions.
8. Implement report/block policy handling, admission/matching exclusions and restricted evidence visibility.
9. Verify the agent tool allowlist cannot retrieve private contacts or start location sharing.
10. Test revoked grants during an open socket, removed members with existing sessions, expired signed access, and unavailable phone location. Do not call live emergency services in tests.

Done when: location/contact access is controlled by current grants rather than role alone, revocation stops new disclosure, and unsupported background tracking/escalation is not advertised as working.

### I17 — Implement the Media service and real face-processing jobs

Owner: Media/Core. Product: P14. Architecture: A11.

This step can start as soon as I04/I05/I07 are ready; it does not need to wait for AI, maps or voice implementation.

1. Create private original/derived asset paths and signed upload/download commands with trip ownership and bounds.
2. Implement upload completion verification, deduplication and photo_process enqueue.
3. Implement SVC-04 lease claim/heartbeat/retry/cancel against Core's internal API.
4. Validate image bytes, dimensions and orientation; create thumbnails and strip exposed location metadata from derivatives.
5. Load pinned YuNet/SFace models and run actual detection/alignment/embedding extraction.
6. Persist bounded face metadata/model-version results through Core's scoped result command.
7. Add explicit reference consent, single-face selection, reference embeddings and trip-only candidate search.
8. Choose/version a threshold using consented representative positive and negative examples; inspect errors rather than treating a library default as universal accuracy.
9. Add manual correction/unknown handling and revocation cleanup, including late worker result rejection.
10. Implement collage_render with Pillow, signed output storage and actual export dimensions.
11. Test no face, multiple faces, duplicates, rotated/large/broken files, weak matches, cross-trip denial and provider-independent CPU execution.

Done when: real photos produce real embeddings and candidate matches, a real collage file is produced, and no job can read unrelated trip assets or restore revoked biometric data.

### I18 — Integrate shared memories, reference search and collage export UI

Owner: web/Media/Core. Product: P14.

1. Build batch upload UI with progress, retry and processing status.
2. Build album grid and private signed-asset loading with expiry recovery.
3. Add reference upload/consent, multiple-face selection and candidate match review.
4. Add manual match corrections, unassigned photos and zero-result states.
5. Build collage photo selection, layout options, asynchronous progress, preview and download.
6. Add consent revocation/reference deletion UI and explain the scope of processing.
7. Test narrow mobile layouts, interrupted uploads, permission removal mid-job and expired image URLs.

Done when: a participant can upload, find themselves by an authorized reference, correct results and download a collage without developer intervention.

### I19 — Complete the three onboarding modes with live voice

Owner: Agent/web/Core. Product: P02. Architecture: A08–A09.

1. Connect pasted AI-context input to real candidate extraction and review from I10/I13.
2. Add interactive text follow-ups that ask only for missing useful fields and preserve already confirmed values.
3. Implement authenticated short-lived Gemini Live token provisioning; permanent keys remain server-side.
4. Implement microphone capture, interruption, transcript display, session expiry/reconnect and permission errors.
5. Route reviewed results to Core's Passport command; a voice transcript alone is not permission to publish sensitive fields.
6. Keep skip and text alternatives fully functional if the user declines microphone/context sharing.
7. Test English and Hindi/Hinglish extraction, conflicting answers, misunderstood budgets/currencies and correction before save.

Done when: all three paths reach discovery with truthful profile state and voice is genuinely interactive against the selected Live model.

### I20 — Finish the temple landing and mobile design system

Owner: web/design. Product: P01/P15.

Visual exploration/assets can begin after I01 while the data services are built. Final acceptance uses integrated real-state screens.

1. Establish tokens for warm paper, charcoal, coral and teal, typography, spacing, motion and semantic states.
2. Create a licensed or clearly illustrative Kailasa composition with entrance/foreground/background layers.
3. Implement the scroll-linked opening/reveal sequence with GSAP and deliberate desktop side-copy placement.
4. Compose a separate mobile crop/layout; do not merely shrink the desktop scene.
5. Keep sign-in/Create/Discover available without completing the animation. Add reduced-motion/static behavior.
6. Optimize images and loading order; avoid blocking usable content on video/3D assets.
7. Apply the same visual language to discovery cards, fit breakdowns, agenda, votes, chat, map and memories.
8. Test 360/390/430px widths, desktop, touch targets, keyboard chat behavior, focus, screen-reader labels, contrast and landscape.
9. Test loading/empty/error/stale/permission states as deliberately designed screens.

Done when: the landing communicates the travel identity and the signed-in app is equally polished and usable on mobile, with no decorative effect compromising basic navigation.

### I21 — Run full system verification and resolve integration defects

Owner: integration, all service owners. Architecture: A14.

1. Run contract regeneration checks, lint/type checks, builds and service unit tests.
2. Run database-backed tests for all decision, membership and grant commands.
3. Run independent-browser end-to-end flows for private groups, public discovery/admission, Trippy proposals, branch merges and memories.
4. Add concurrency tests for final capacity slots, simultaneous votes, competing change sets, duplicate messages and worker lease expiry.
5. Test an untrusted source requesting extra tool permissions, a forged actor, a wrong-trip ID, revoked user sessions/grants, private URL guessing and secret leakage in responses/logs.
6. Exercise network disconnect/reconnect, out-of-order/duplicate events, provider timeout/quota error, failed photo processing and server restart.
7. Verify canonical export/conformance, exact decimal totals, timezone rendering and retained superseded records.
8. Measure realtime propagation and ordinary API latency on the actual deployment; label measurements with environment/sample size. Do not claim target numbers without measuring them.
9. Measure/check mobile image load and interaction performance; inspect real device behavior where possible.
10. Check face retrieval against the selected consented examples and document limitations/false matches.

Done when: all required acceptance checks pass or a remaining limitation is explicitly documented without misrepresenting the feature as complete. The mandatory hard proof must have no unresolved correctness failure.

### I22 — Deploy and verify the hosted application

Owner: integration/Core. Architecture: A02, A13–A14.

Deploy an early skeleton after I04 so authentication/cookies/CORS/provider restrictions are exercised before the last hours. Repeat this step for the final integrated release.

1. Provision environment-specific Supabase, storage buckets and service credentials.
2. Run migrations through a controlled migration job, then seed explicit demo fixtures and create real demo auth accounts.
3. Deploy Core API, Core jobs, Trippy and Media with appropriate process types, readiness checks and resource limits.
4. Deploy the frontend with only public configuration. Configure SPA deep-link rewrites.
5. Configure HTTPS, Auth redirects, exact CORS origins, WebSocket routes, browser-key referrers and server-key restrictions.
6. Verify long-running workers actually run on the selected hosting plan and are not assumed to behave like a short-lived request function.
7. Confirm secrets and migration credentials are absent from frontend assets and public logs.
8. Run the mandatory hard proof against the hosted URLs, then exercise a real Trippy tool call and photo job.
9. Exercise restart/recovery, inspect queue health and record deployed commit/version.
10. Document rollback to the previous deploy and compatible migration strategy. Do not roll schema backward destructively during demo recovery.

Done when: an independent browser/device can reach and use the hosted application, background jobs complete, and actual hosted configuration passes the same permission and decision checks as local development.

### I23 — Complete submission and operational handoff

Owner: integration/demo owner.

1. Update README according to the organizer contract in HACKATHON.md. At minimum include product summary, stack, exact setup, environment variables, migration/seed commands, service startup, test commands, AI usage and known capability limits.
2. Complete DATA_MODEL.md canonical/additive mapping and the organizer's D1–D9 mapping if supplied.
3. Keep ARCHITECTURE.md synchronized with what was actually deployed, including any deviations from this plan.
4. Write API.md from generated contracts and DEMO.md with the two-browser proof and recovery instructions.
5. Provide a demo reset command targeting only explicit demo records, using legal retained statuses where appropriate. It must not wipe real users or the canonical source dataset.
6. Rehearse: discover/join → shared plan → human proposal → live vote/commit/lock/history → Trippy proposal → branch/map → photo reference/collage, using only completed capabilities.
7. Capture a clearly labeled backup recording of the working deployment. Preserve local startup instructions for network trouble.
8. Verify clean checkout, repo structure, .env.example completeness, no secrets/private photos, conformance result and deployed commit.
9. Prepare the requested solution write-up/presentation using the organizers' actual templates. Do not invent submission links or claim unverified deployments.
10. Record final tested behavior and limitations, then submit through the organizer's required channel.

Done when: another team member can run the project from the README and reproduce the proof without relying on this chat.

## 5. Expansion implementation order

These steps preserve the broader vision from PRODUCT.md. They follow working P01–P15 foundations and are not silently counted as implemented hackathon features.

### E01 — Form a group and a feasible outing together (P16)

1. Add opt-in travel intents with dates, starting area, preferences, budget and expiry.
2. Reuse deterministic eligibility and preference factors to propose candidate cohorts.
3. Generate feasible outing drafts using actual available place/route evidence.
4. Send in-app invitations only within each user's granted matching/notification preferences.
5. Create membership only after explicit acceptance; then use the ordinary trip decision engine.
6. Test low participant density, no feasible plan, declined invitations, expiry and duplicate acceptance. Do not show invented users as available matches.

### E02 — Publish one activity and match groups to it (P17)

1. Add activity-scoped publication, capacity and participant grants independent of trip membership.
2. Add scoped application/approval and enquiry/conversation permissions.
3. Define electorate and cost effects for changes involving both trip members and activity guests before enabling voting.
4. Expose only the selected activity, meeting details and authorized messages; keep accommodation and unrelated trip plans private.
5. Extend matching to group-to-activity applications without flattening all group members into one account.
6. Test cross-group permission leakage, changing rosters, cancellation and reunion effects.

### E03 — Connect saved wishes with future opportunities (P18)

1. Add explicit saved experiences and opt-in opportunity preferences.
2. Run expiry-aware matching jobs against public trips or consenting friend-circle availability.
3. Produce explainable, dismissible suggestions; never automatically book or sign users up.
4. Capture explicit feedback and reviewed preference updates, preserving source/version history.
5. Add notification frequency controls and test empty/no-overlap cases.

## 6. Suggested sprint sequencing

This is a coordination target, not a claim that elapsed hours guarantee completion. Actual dependencies and passing checks determine readiness.

| Window from build start | Primary integration goal | Parallel work |
|---|---|---|
| Hours 0–3 | I00–I05 foundations and service contracts | Landing composition; Agent/Media skeletons and provider/model access |
| Hours 3–6 | I06–I09 mandatory live decision proof | Passport forms; chat UI; Media jobs against agreed contracts |
| Hours 6–11 | I10–I13 Passport/discovery/chat/Trippy | Real face pipeline; mobile screen integration |
| Hours 11–16 | I14–I18 branches/maps/grants/memories | Voice and landing refinement; hosted smoke checks |
| Hours 16–21 | Complete I19–I20 and full integrations | Failure tests, performance measurements, docs |
| Final 3 hours | I21–I23 stabilization, rehearsal and submission | Fix defects; avoid unverified late architectural changes |

The supplied process lists 24 September noon to 25 September noon and a 09:00 stabilization point on day two. Use any newer on-site organizer instructions if those timings changed. Do not spend a fresh hour redoing product discovery; the decisions in these documents are the starting build contracts.

## 7. Acceptance and traceability matrix

| Product | Primary service owners | Architecture | Implementation evidence |
|---|---|---|---|
| P01 Landing/auth/mobile shell | SVC-01, SVC-02 | A02, A06 | I04 real sessions; I20 visual/device checks |
| P02 Three onboarding modes | SVC-01, SVC-02, SVC-03 | A08, A09 | I10 review/skip; I19 actual import/text/voice |
| P03 Trip lifecycle/RBAC | SVC-01, SVC-02 | A04, A06 | I05 admission/roles tests |
| P04 Passport/Genome | SVC-01, SVC-02 | A08 | I10 override/privacy/freshness checks |
| P05 Discovery/guides/representation | SVC-01, SVC-02 | A08 | I11 deterministic scoring/public projection tests |
| P06 Shared itinerary | SVC-01, SVC-02 | A05, A07 | I08 cross-browser state |
| P07 Vote/commit/lock/history | SVC-01, SVC-02 | A05 | I06 transaction tests; I09 hard proof |
| P08 Chat/enquiries/notifications | SVC-01, SVC-02 | A06, A12 | I12 private conversation and dedupe checks |
| P09 Trippy tools | SVC-01, SVC-02, SVC-03 | A09 | I13 sourced answer and voted tool-created change |
| P10 Alternatives/consensus | SVC-01, SVC-02, SVC-03 | A05, A10 | I14 fork/rebase/atomic merge tests |
| P11 Excursions/reunion | SVC-01, SVC-02, SVC-03 | A10 | I14 participant/timing checks |
| P12 Map/location | SVC-01, SVC-02 | A07, A10 | I15 actual routes; I16 grant/revocation checks |
| P13 Contacts/check-ins/reporting | SVC-01, SVC-02 | A06, A07 | I16 access/audit/delivery-capability checks |
| P14 Memories/face matching/collage | SVC-01, SVC-02, SVC-04 | A11 | I17 actual processing; I18 export/review |
| P15 Reliability/accessibility | All | A14 | I21 failures/performance; I22 hosted verification |
| P16 Group formation | SVC-01, SVC-02, SVC-03 | A08, A09 plus extension | E01 opt-in invitation and feasibility proof |
| P17 Activity/group joining | SVC-01, SVC-02 | A06, A10 plus extension | E02 scoped membership/privacy proof |
| P18 Wishes/opportunities | SVC-01, SVC-02, SVC-03 | A08, A12 plus extension | E03 consented suggestion/notification proof |

## 8. Completion record format

For each implementation step, record: status (pending/in progress/verified/blocked), responsible person, commit/reference, commands/checks executed, actual result, remaining limitations and next dependent step. Do not mark a step verified because its UI exists or because a mocked adapter returned success.

Feature completion requires the frontend, permission checks, durable state, realtime/job behavior where applicable, and acceptance evidence to agree. This is how the separate services become one coherent Convia product.
