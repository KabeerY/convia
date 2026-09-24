# Convia — Architecture and Service Contracts

Version: 1.0 · 24 September 2026 · Repository: kv-hack2026-pacmen

Status: target architecture for a fresh implementation. The standalone frontend landing is implemented; backend accounts, infrastructure, domain services, migrations and measurements described here still need to be created. The landing's local interactions do not implement the distributed service contracts below. The older prototype remains a visual reference.

Read with [PRODUCT.md](PRODUCT.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Product IDs P01–P18 and service IDs SVC-01–SVC-04 are stable cross-document references.

## A01. Architectural decisions and invariants

1. **One transactional decision authority.** Voting, decision acceptance, itinerary mutation, lock metadata, version advancement, audit history and durable notification records commit together in PostgreSQL.
2. **Three application backend services.** Core API, Trippy, and Media have independent processes, packages, health checks, tests and deployment definitions. The frontend is a fourth deployable application.
3. **One persisted source of truth initially.** Supabase PostgreSQL stores canonical and additive data. Auth, storage and managed realtime are infrastructure services. Do not introduce a second authoritative database for votes or chat.
4. **Core owns durable domain writes.** Trippy and Media operate through narrow internal command APIs. They have no unrestricted database credentials. This deliberately keeps domain consistency in Core while independently deploying AI and compute-heavy processing.
5. **Client state is a cache.** No localStorage record can authorize a vote, establish membership or commit an itinerary. Temporary local drafts must be visibly unsaved until acknowledged.
6. **Proposal content is immutable after publication.** Votes apply to an exact ordered set of operations and its recorded base revision.
7. **No privileged lock bypass.** Organizer, co-organizer, participant and agent use the same approved-change pathway.
8. **History survives plan evolution.** Replacement/removal changes statuses and creates revision history. It never erases canonical travel records or decision evidence.
9. **Private data follows its own permissions.** Public trip visibility does not imply visibility of chat, exact budgets, emergency contacts, locations or biometric records.
10. **Delivery is retryable.** Network messages and jobs can duplicate or arrive late. Idempotency and revision checks protect state; do not claim exactly-once network delivery.
11. **External data is evidence, not authority.** Model output, source pages and place data are validated inputs. They do not authorize mutations or guarantee bookings, opening hours, safety or identity.

## A02. Technology and deployment topology

| Component | Selected approach | Reason and constraints |
|---|---|---|
| SVC-01 Frontend | React, Vite, TypeScript, React Router | Reuse visual ideas from prototype; fresh typed state and APIs |
| UI | Tailwind/design tokens, accessible primitives, TanStack Query | Separate visual state from server-owned state |
| Landing animation | Existing requestAnimationFrame/CSS 3D, layered optimized imagery | The implemented temple reveal and reduced-motion path remain in place; GSAP is optional for later app work, not a PR-01 rewrite |
| SVC-02 Core | Node.js, Fastify, Zod, PostgreSQL driver, decimal.js | Typed command boundary; exact money; one decision transaction |
| SVC-03 Trippy | Python, FastAPI, Google GenAI SDK, Pydantic | Tool use, grounded assistance, preference extraction and voice |
| SVC-04 Media | Python worker, OpenCV YuNet/SFace, Pillow | Face matching and collage generation independent of request latency |
| Persistence | Supabase PostgreSQL | Canonical SQL compatibility and atomic decisions |
| Authentication | Supabase Auth | Verified sessions mapped to canonical user IDs |
| Durable-update transport | Supabase private database-triggered Broadcast | Notifications after committed database changes |
| Ephemeral sensitive streams | Core-authorized WebSocket connection | Per-update membership/grant checks for location and presence |
| Files | Private Supabase Storage buckets | Signed upload/download, scoped objects and revocable access |
| Maps | Google Maps JS, Places New, Routes | Aligned place/map attribution and route data |
| Background work | PostgreSQL durable jobs with leases, claimed through Core | One job contract usable by Node and Python; no unnecessary broker initially |
| Contracts | JSON Schema/OpenAPI, generated TS and Python bindings | Prevent independently invented payloads |
| Tests | Node tests/integration, pytest, Playwright | Test decisions, service boundaries and independent browsers |
| Local execution | Supabase CLI/Docker plus application containers | Local auth/database/storage/realtime; providers configured separately |
| Hosted execution | Static frontend host; container host for Core/Trippy/Media; hosted Supabase | Concrete hosting account chosen during provisioning; Railway is a reasonable container-host candidate |

Pin runtime and package versions in lockfiles during setup; do not carry the prototype's unbounded latest dependencies into the new application. Model identifiers are configuration, selected from models actually accessible to the team and verified with a live tool-call test.

### Runtime shape

    Browser / mobile web
       |-- Supabase Auth: sign-in and token refresh
       |-- HTTPS Core API: all domain reads and commands
       |-- private Supabase Realtime: committed-change notifications
       |-- Core WebSocket: authorized ephemeral presence/location/streaming
       |-- signed Storage URLs: permitted file transfers
       `-- Gemini Live: short-lived voice token; review before persistence

    Core API + Core jobs process
       |-- PostgreSQL: commands, views, immutable history, jobs/outbox
       |-- Trippy internal work API / job claims
       |-- Media internal work API / job claims
       |-- Maps/Places/Routes adapters
       `-- optional notification-provider adapters

    Trippy --> Core's scoped tool commands --> proposal publication
    Media  --> Core's scoped media result commands --> private assets

All long-running services expose health/readiness. Core API and Core jobs may run as separate processes from the same SVC-02 package. The initial ephemeral WebSocket deployment uses one Core API instance. Multi-replica fan-out requires a shared broker and revocation mechanism before horizontal scaling; managed database broadcasts alone do not distribute the Core socket's in-memory sessions.

## A03. Repository and code ownership

    kv-hack2026-pacmen/
      README.md
      package.json
      pnpm-workspace.yaml
      frontend/
        package.json
        src/{app,features,components,lib,styles}/
      backend/
        core-api/
          package.json
          src/{auth,modules,commands,queries,realtime,jobs,providers}/
        trippy-service/
          pyproject.toml
          src/trippy_service/
        media-worker/
          pyproject.toml
          src/media_worker/
      packages/contracts/
        schemas/
        generated/typescript/
        generated/python/
        openapi.yaml
      data-model/
        schema.sql
        migrations/
        seed/{canonical,demo}/
        DATA_MODEL.md
      ai/
        pyproject.toml
        prompts/
        tools/
        evals/
        pipeline.py
      docs/{PRODUCT,ARCHITECTURE,IMPLEMENTATION_PLAN,API,DEMO}.md
      tests/{integration,e2e,fixtures}/
      docker-compose.yml
      .env.example
      .gitignore

The three documents already exist; other paths above are planned implementation artifacts. Do not present the tree as generated application code.

The ai package contains the reusable model pipeline, prompt versions, tool declarations and evaluations. SVC-03 supplies transport, authentication, job execution and lifecycle around that package. Avoid duplicate prompts or tool logic under both directories. Build containers from the repository root so shared contracts and ai packages are available.

### Service responsibility matrix

| ID | Owns | Reads/depends on | Must not own |
|---|---|---|---|
| SVC-01 | Rendering, forms, ephemeral UI state, accessibility, local unsaved drafts | Public and authorized Core projections; event notifications | Membership truth, vote tallies, locks, secret keys |
| SVC-02 | Identity mapping, trip lifecycle, roles, all durable domain commands, decisions, histories, matching, chat, grants, job state, media metadata | Auth verification; provider adapters | LLM reasoning or CPU-heavy image inference in request transactions |
| SVC-03 | AI orchestration, extraction, tool selection, consensus drafts, voice configuration | Run-scoped authorized Core tools; Gemini/search | Direct DB writes, voting, accepting proposals, emergency-contact retrieval |
| SVC-04 | Image validation/processing, embeddings, candidate matches, thumbnails, collages | Leased media jobs; signed assets; consent-authorized inputs | Trip decisions, cross-trip face search, unrestricted Storage/DB access |

Core modules are identity, trips/membership, passports, matching/Genome, itinerary/decisions, branches, conversations, location/grants, media-catalogue, moderation and jobs. They have separate contracts but remain in the same domain service where atomic operations require it.

## A04. Canonical data and additive schema

### Preserve the supplied model

Use all relevant named tables without renaming fields or replacing IDs:

| Canonical tables | Role |
|---|---|
| currencies, languages, countries, cities | Money, locale and geography reference data |
| users, user_preferences | Canonical traveller identity and preference projection |
| trips, trip_members | Trip container and membership |
| itineraries, itinerary_items | Canonical active plan and retained superseded items |
| proposals, votes | Canonical per-operation proposals and corresponding votes |
| tour_guides | Guide discovery catalogue |
| user_interactions | Supported canonical interactions; do not add invalid entity_type values |

The supplied package contains 14 named tables. The organizer README contract is in [HACKATHON.md](../HACKATHON.md). Its D1–D9 mapping is unprovided and must be resolved in DATA_MODEL.md without invented aliases.

Canonical rules: additive changes only; opaque prefixed IDs; decimal money strings plus ISO currency; offset-bearing instants; zoneless calendar dates; legal existing enum values; BCP-47 languages; six-decimal WGS-84 coordinates; no hard deletion of canonical travel records.

The supplied SQL already contains foreign keys and indexes but does not enforce every business invariant. Add cross-trip consistency constraints/checks, indexes, and a partial unique constraint for one active main itinerary per trip after auditing imported rows.

### Additive records: minimum field contracts

Each mutable extension record has its own opaque ID, status, created_at and updated_at unless explicitly immutable or ephemeral. Timestamps are server-controlled. JSON fields are versioned and schema-validated; JSON does not replace relational ownership and foreign keys.

| Record family | Fields/purpose |
|---|---|
| wm_auth_identities | auth subject UUID, canonical user_id, provider; unique subject and mapping |
| wm_profile_field_state | user_id, field, value source, confirmed flag, visibility; excludes technical defaults from personalization |
| wm_trip_settings | trip_id, visibility, capacity, admission policy, public preview version, trip timezone, role-policy version, realtime access_epoch |
| wm_member_permissions | member_id, app role and delegated capabilities; canonical owner/editor/viewer remains intact |
| wm_invites | trip_id, hashed code/token, expires_at, max uses, use count, revocation and issuer |
| wm_join_requests | trip_id, requester, introduction, state, reviewer, reviewed_at; one active request per user/trip |
| wm_passports / wm_trip_passports | owner, schema version, confirmed fields, hard/soft classification, overrides, field visibility, revision |
| wm_genome_snapshots | trip_id, source membership/preference revisions, distributions, public/member projections, generated_at |
| wm_match_results | actor/search context, candidate trip, factor scores, evidence coverage, scoring version, expiry; short-lived cache |
| wm_discovery_events | app-specific trip discovery events not representable by canonical interaction enums |
| wm_change_sets | trip_id, itinerary_id, initiator, actor kind, base version, status, approval threshold, deadline, payload hash, committed_at |
| wm_decision_entries | change_set_id, canonical proposal_id, ordinal, typed payload, expected target revision; one row per operation |
| wm_electorate | change_set_id, user_id, role snapshot; unique voter per decision |
| wm_ballots | change_set_id, user_id, current yes/no/abstain and timestamp; authoritative ballot per bundle |
| wm_ballot_events | immutable ballot revisions, actor, value and timestamp; no history overwrite |
| wm_item_state | logical_item_id, itinerary_id, current canonical item_id or null, revision, decision_locked, latest decision |
| wm_item_revisions | logical item, revision number, canonical item reference, prior reference, immutable content/status snapshot, change_set_id |
| wm_history_events | trip, logical item/decision references, event type, actor, server timestamp and privacy-safe structured change |
| wm_branches / wm_branch_items | alternative or excursion type, base version, owner/visibility, draft operations or approved branch linkage |
| wm_branch_members / wm_reunions | excursion participants, departure/reunion details and accepted decision linkage |
| wm_cost_metadata / wm_cost_allocations | cost basis, estimate/unknown/free state, evidence source, item/member allocations and currency |
| wm_conversations / wm_conversation_members | trip group or private enquiry, explicit recipients and access policy |
| wm_messages | conversation, sender/agent/run, content kind, client_message_id, conversation sequence, proposal attachment |
| wm_notifications | recipient, event type/reference, read status, delivery-channel status |
| wm_location_grants / wm_locations | sharing owner, trip, recipient scope, expiry; most recent authorized position, accuracy, timestamp, session sequence |
| wm_emergency_contacts / wm_contact_requests / wm_contact_grants | encrypted owner-controlled contact; named recipient, purpose, status and expiry; access audit |
| wm_check_ins | owner, trusted recipient, expected time, confirmation/escalation state and configured delivery capability |
| wm_media / wm_media_jobs | trip object metadata, uploader, checksums, processing status, consent context and derived objects |
| wm_face_references / wm_face_embeddings / wm_face_matches | authorized reference, face bounding box/vector/model version, reviewed candidate result; trip-scoped |
| wm_collages | selected authorized media, layout, job, output object and export status |
| wm_reports / wm_blocks | reporting evidence/access controls and matching/admission exclusions |
| wm_agent_runs / wm_tool_calls | initiator, trip, authorized scope, model/prompt version, status, redacted tool audit and idempotency |
| wm_jobs | queue/type/payload version, dedupe key, state, attempts, lease owner/expiry, monotonic lease generation, next retry, result reference |
| wm_outbox / wm_trip_sequences | durable event IDs, per-trip sequence, aggregate versions, safe notification payload, delivery state |
| wm_idempotency | actor+route+key, request hash, status and durable response reference |

### Important semantic mappings

- **Roles:** organizer maps to canonical owner; co-organizer and participant map to editor plus explicit extension capabilities; read-only guest maps to viewer. Never add illegal canonical role enum values.
- **Decision lock:** canonical itinerary_items.locked retains its existing must-see/optimizer meaning. wm_item_state.decision_locked represents the mandatory decision-authority lock. UI/API expose decision lock clearly. If organizers explicitly revise canonical semantics, document a migration decision rather than silently repurpose the field.
- **Superseded items:** canonical status replaced, presented as Superseded in the UI. A removal uses removed. Old IDs are never assigned to new content.
- **Proposal states:** canonical statuses stay open/accepted/rejected/expired. Rich states such as stale/withdrawn/validation_failed live on wm_change_sets and map to rejected or expired canonical proposals with an explicit reason.
- **Auth:** auth UUIDs are not canonical usr_ IDs. Map them through wm_auth_identities.
- **Missing profile data:** canonical required fields may need explicitly documented technical defaults. wm_profile_field_state marks them unconfirmed/system_default; they never affect matching, public display or Genome calculations. Do not silently treat a default budget band as a user preference.
- **Synthetic data:** imported example identities and guides remain labeled demo/catalogue data. They are not real verified people or live available inventory.

### Money and cost interpretation

Use NUMERIC and decimal libraries; JSON monetary amounts are strings such as "800.00". The canonical storage contract remains two decimal places, including currencies whose display exponent differs. Do not silently convert currencies without a versioned FX source.

For new activities, explicitly record whether the quoted amount is per party, per person or unknown. Normalize known amounts into canonical item cost for the included activity participants, with separate per-member allocation. Use largest-remainder allocation so shares sum exactly to the group amount. trip_members.share_weight is a cost-allocation input, never a vote weight in the one-person/one-vote policy.

Do not assume imported costs are per person. Unknown is not free: retain an explicit cost-known flag and avoid claiming budget feasibility from placeholder zeroes. Itinerary totals show known/estimated portions and unresolved costs separately.

## A05. Decision model and atomic commit algorithm

### Single actions and bundles

Every new user-facing proposal is represented by a wm_change_sets row. A simple proposal has one entry; a merge or multi-item suggestion has several ordered entries.

Each entry has its own canonical proposals row with a legal add/remove/replace/reschedule action and the corresponding target. One clearly labeled ballot approves or rejects the entire bundle. wm_ballots holds that ballot; the same value is mirrored transactionally into canonical votes for every entry. Never sum those mirrored rows as extra voting power.

This mapping preserves the canonical per-proposal schema without pretending a batch is a new canonical action enum. All canonical child proposals accept or reject together.

### Publication

1. Core resolves actor from the verified session, never from a client-supplied user_id.
2. Validate active planning membership and payload schemas.
3. Read the current itinerary version, target logical revisions and current constraints.
4. Validate times, currencies, target ownership, cost basis and operation completeness.
5. In one transaction lock trip then active itinerary, recheck the supplied base version and publication constraints, and create change set, canonical proposals, entries and the frozen electorate. Preflight reads outside this transaction cannot establish the publication version.
6. Set threshold floor(N/2)+1, server deadline, ordered payload hash and base itinerary version.
7. Record history and outbox event. No automatic proposer vote.

### Voting and commit: normative transaction

Implement a database command function behind Core, conceptually cast_ballot_and_maybe_commit. Use a restricted command role with EXECUTE access; canonical write privileges belong only to the non-login command-function owner. Set a safe fixed search_path for SECURITY DEFINER functions and revoke default public execution.

Within the command:

1. Lock trip, active itinerary, then change set in a consistent order used by all related commands.
2. Verify the current actor's active membership and permission to access this decision.
3. Validate idempotency key/request hash. Return the original result for an authorized exact retry, even if the original call committed or closed the decision; reject reuse with different content. This lookup precedes fresh-command open/deadline checks.
4. For a new command, verify frozen electorate membership, current open state and server deadline. Upsert the current ballot, append a ballot event and mirror the value to canonical votes with weight 1.00.
5. Count yes ballots once per eligible voter. If below threshold, append vote event and return pending.
6. On threshold, compare base itinerary version and expected target revisions. V1 uses a conservative itinerary-wide base-version check: any intervening committed itinerary change makes this proposal stale. Never automatically rewrite the approved payload.
7. Recheck current membership-sensitive allocations, declared hard constraints, schedule validity and source-expiry requirements. Validation failure closes the decision with a recorded reason; do not mark it accepted.
8. Apply all ordered operations atomically. Add creates a confirmed canonical item. Replace/reschedule marks the old item replaced and creates a new canonical item with a new ID linked to the same logical activity. Remove marks the current item removed and records a tombstone revision.
9. Update logical item revisions/current pointers and set decision_locked on affected logical activities. Preserve full previous revision snapshots.
10. Update totals and increment itineraries.version once for the entire bundle. Mark the canonical source/generated_by as vote; preserve Trippy attribution in extension audit fields.
11. Set all child proposals accepted and the change set committed with server timestamps. Finalize ballots; no further vote changes.
12. Insert per-item history, a unique commit record/reference, and an outbox event with a monotonic trip sequence.
13. Commit. Only committed state may be broadcast.

There is no durable accepted-but-unapplied state. A transient database error rolls back the decisive vote and all changes together; retry with the same idempotency key. Exactly one commit per change set is enforced by uniqueness and terminal-state checks.

### Deadline and concurrency rules

- Core's durable deadline worker invokes the same finalization logic with server time. It runs even when no browser is open.
- Reaching the absolute-majority threshold commits immediately before expiry. At expiry an unresolved decision becomes expired; a majority of only the people who bothered to vote is not sufficient.
- New members do not join the frozen electorate. Departed members cannot cast/change ballots; already recorded ballots remain historical votes and the denominator never shrinks.
- Membership changes do not grant the organizer a way to force a pass. At commit, revalidate any changed participation/cost constraints; if the approved payload is no longer valid, require a new decision.
- Race example: proposals A and B reference version 12. A commits version 13. B cannot commit against 12, even if its decisive vote arrives simultaneously. B becomes stale with votes retained and a review/new-proposal action.
- Finer item/day dependency tracking may later reduce unnecessary staleness. It is a separately tested optimization; v1's strict rule is the documented behavior.

### Direct-edit protection

Canonical itinerary writes are restricted to command functions. Browser roles and AI/Media roles have no direct DML grants. Core has no generic “patch arbitrary table” endpoint. A direct edit route checks decision_locked and returns HTTP 409 with code DECISION_LOCKED and the raise-a-proposal action. It never accepts a client field that clears the lock.

Personal alternative drafts are editable. Publishing them enters the same change-set path. There is no organizer-only force-unlock route. Compensating changes require new approval.

## A06. Authentication, authorization and privacy

### Authentication

SVC-01 obtains Supabase sessions. Core verifies signature, issuer, audience and expiry using the provider's supported JWT/JWKS flow, maps subject to canonical user and rejects forged/stale credentials. Refresh is handled through the supported client SDK. Supabase secret/service credentials never appear in browser bundles.

### Authorization

Every Core route uses a named policy: public projection, member read, participant command, organizer management, conversation member, asset access, contact grant or location recipient. JWT authentication alone is not trip authorization.

Use transaction-time checks for writes. Removing a member revokes future private reads, writes, socket subscriptions, media grants and tool-run capability. Private enquiry recipients are explicit; a role transfer is not permission to read all prior enquiries.

Canonical public-schema tables must not remain broadly exposed through auto-generated database APIs. Revoke unintended anon/authenticated table writes and reads, use least-privilege grants, and enable/test RLS wherever client-accessible infrastructure is used. Realtime private-channel policies check actual membership, not merely auth != null.

### Service-to-service access

Use distinct server-only Trippy and Media credentials over HTTPS. Core maps each credential to an allowlist. Each claimed job/tool call also carries an opaque short-lived capability bound to run/job ID, initiating user, trip, allowed operation and expiry. Core rechecks the user's current access on execution; a queued job does not preserve removed privileges.

Models receive neither service secrets nor general SQL/HTTP execution tools. Tool arguments cannot choose the actor or add arbitrary scope. Every consequential tool call has a stable dedupe key and a redacted audit record.

### Data visibility

- Public cards are explicit projections, never raw trip/member joins.
- Private budget constraints are evaluated in Core; Trippy receives only the authorized context needed for its request.
- Do not expose individual private constraints in explanations or public Genome data. Sensitive aggregates need explicit contributor permissions and suppression where a small group reveals the individual. Do not claim mathematical anonymity from averaging.
- Private messages, emergency contacts and biometrics are excluded from generic model context and application logs.
- Contact details use authenticated encryption with key versioning; Core logs access metadata, not plaintext values.
- Face and location records have short, explicit retention/consent policies. Canonical decision-history retention does not justify retaining raw biometric references forever.

## A07. Realtime, presence and connection recovery

### Durable changes

The transaction writes wm_outbox. A database trigger inserts a private broadcast notification in the same transaction; subscribers receive it through committed database change propagation. Notification payloads contain event_id, trip_id, sequence, kind and resource/version references, not private contact/Passport/photo data.

Trip topics include an access epoch: trip:<trip_id>:events:<access_epoch>. Subscription policy checks both current membership and current epoch. Removing a member increments the epoch in the membership transaction; later domain events use only the new topic. Send a content-free subscription.changed control on the old topic so remaining members refetch their authorized subscription configuration. Reconnect/periodic refresh also recovers a missed control. Do not assume changing an RLS row instantly reauthorizes or evicts an already connected Supabase channel. Already delivered/in-flight events cannot be recalled; old topics receive no subsequent private domain events.

Private enquiry and personal-notification events use recipient-scoped topics with their own access checks; they are not broadcast to the whole trip. Public preview updates contain only public-safe information. A private conversation's sequence/recovery cursor is scoped to that conversation, independent of the trip event sequence.

Core projections return an as_of_sequence. The client subscribes and buffers notifications, fetches a snapshot, then applies/refetches for notifications newer than the snapshot. On reconnect or detected gap, refetch authoritative state. Never assume a WebSocket stream is a complete permanent event log.

Core's outbox process retries non-transactional side effects such as notification delivery. Events and client handlers are idempotent. Update Plan, Chat and History from the same committed decision identity.

### Ephemeral presence and location

Core authenticates its WebSocket connection and validates trip membership when joining a room, publishing and selecting recipients. Presence carries user ID, room, activity and last_seen, with heartbeat/expiry. Browser-supplied identity is ignored.

Location messages carry sharing-session ID, monotonic client sequence, lat/lng, accuracy and observed_at. Core validates coordinate ranges, session ownership, active grant, expiry and freshness. Rate-limit updates; coalesce rapid movement. Persist only the latest position and necessary consent metadata, not an automatic permanent travel trail.

On revocation/removal, Core stops new fan-out, closes affected room subscriptions and clears in-memory position caches for unauthorized recipients. Clients clear local position displays. Previously delivered information cannot be recalled; short-lived signed asset URLs and in-flight packets have bounded exposure and must not be described as retroactively erased.

Foreground web geolocation requires HTTPS and user permission. Background/locked-phone continuity is not guaranteed; stale markers are mandatory. Native background tracking is a separately implemented platform feature.

## A08. Passport, Genome and ranking implementation

### Preference pipeline

Imported text/voice → SVC-03 extraction candidate → Core schema validation → user review → confirmed Passport revision → trip override → Genome invalidation → deterministic refresh.

Store provenance per field: explicit form, user-confirmed extraction, unconfirmed inference or system default. Only explicitly permitted confirmed values contribute to public/person-level matching. Raw imported text should have an explicit deletion/retention choice and should not be broadcast.

### Discovery algorithm v1

1. Filter visibility, trip admission state, capacity and required date/destination constraints.
2. Evaluate declared hard conditions as compatible, incompatible or needs_confirmation. Missing evidence is not a successful hard-condition check.
3. Compute trip factors: interest overlap 35%, pace 20%, personal cost fit 25%, date flexibility fit 10%, transport fit 10%.
4. Compute Genome factors: shared interests 35%, pace distribution fit 25%, social-preference overlap 25%, language compatibility 15%.
5. Give each available factor a score in [0,1]. Its effective weight is its within-category weight multiplied by 0.60 for trip factors or 0.40 for Genome factors. Let coverage be the sum of available effective weights and fit = sum(effective_weight * factor_score) / coverage. Missing factors contribute neither score nor weight; coverage zero produces no fit score. Weights are versioned product defaults, not learned or validated probabilities.
6. If coverage is below 0.40, show “insufficient preferences for a reliable ranking” rather than a prominent precise fit score. Otherwise display round(100 * fit) as the heuristic fit percentage, with coverage separately visible. Rank by fit * (0.5 + 0.5 * coverage); missing-score results follow scored results within the same eligibility tier. Use stable trip ID as the final tie-breaker and keep needs_confirmation results visibly separate from confirmed-compatible results.
7. Return factor scores, evidence flags, score version, missing fields and concise deterministic reasons. Do not ask an LLM to invent the numeric score.

Interest overlap can start with normalized category/Jaccard similarity. Semantic embeddings may extend synonym/free-text matching, but structured constraints remain deterministic. Score comparisons use a common currency and explicit per-person cost basis; unknown costs are unresolved.

Public gender representation is derived only from active members' consenting self-descriptions. Return women_public_count, active_member_count, undisclosed_or_not_public_count, and women_public_percentage = 100 * women_public_count / active_member_count. Return null percentage for zero active members. Round only for display, show the denominator, and label the value as publicly self-described representation rather than estimating undisclosed identities. Do not use face embeddings or the matching model to infer gender.

## A09. Trippy execution and tool contracts

### Run lifecycle

Core persists the @Trippy message and creates a deduplicated agent job atomically. SVC-03 claims the job, receives permitted context and starts a bounded model/tool loop. It sends streaming UI events through Core and persists final messages/tool results through scoped completion commands.

Run states: queued, running, waiting_for_provider, proposed, completed, failed, cancelled. The proposal's voting state is separate from the model run; the model does not need to remain running while users vote.

### Tool allowlist

| Tool | Input/output purpose | Mutation authority |
|---|---|---|
| get_trip_context | Sanitized trip, active plan, allowed Genome and constraints | Read |
| search_places | Query, destination/radius, language; sourced candidates | Read |
| get_place_details | Provider place ID; requested supported fields/freshness | Read |
| search_venue_information | Public source retrieval with citations | Read; restricted network adapter |
| estimate_routes | Stops, mode, time; route estimates | Read |
| preview_change_set | Typed operations → validated before/after preview | Draft only |
| create_change_set | Publish exact validated operations for voting | Proposal only |
| create_alternative_branch | Authorized draft branch from source version | Draft only |
| update_alternative_branch | Update draft under expected revision | Draft only |
| propose_branch_merge | Branch diff → change set | Proposal only |
| explain_decision | Public/member-safe status and reasons | Read |

There are no tools named accept_proposal, cast_vote_as_member, unlock_item, execute_sql, read_all_contacts or remove_member. Trippy has CRUD intent over the plan through typed proposed operations; it does not have unconditional CRUD database privileges.

Tool results report proposed/committed separately. Include initiating human, actor_kind=trippy and run ID in audit. Limit steps, output size, provider time and retries; propagate cancellation. Retry tool commands with stable idempotency keys.

### Grounded answers and consensus

Places/Routes adapter lives in Core so cached evidence and field handling are shared with maps. Fetch supported fields selectively: hours, phone, website, pet/accessibility information as available. An absent boolean remains unknown. Respect provider attribution, storage and caching terms; do not persist unrestricted full provider payloads indefinitely.

Search results and pages are untrusted text. They cannot change tool permissions. Public URL fetches reject private/loopback/link-local addresses and metadata endpoints, recheck redirects/DNS, and enforce response size/time limits.

Use separate retrieval and action-planning calls where a selected Gemini model does not support a desired combination of built-in grounding and custom tools. Capability-test the actual model rather than assuming tool combinations work.

Consensus output includes options, explicit tradeoffs and validation results. Core validates timing, costs, participant feasibility and locked-item proposal requirements. Unsupported constraints are marked unresolved. Majority approval is not permission to fabricate a supplier confirmation.

### Voice

Core authenticates the request for a voice session; Trippy creates a short-lived Gemini Live token with appropriate restrictions. Browser connects directly for audio. Voice sessions primarily collect onboarding/draft information; persist only reviewed fields through Core. Never expose a permanent Gemini key or let a client-reported tool result count as a committed action. Text fallback remains available.

## A10. Branches and maps

Alternative branches store base itinerary version and structured draft operations outside the canonical active plan. Draft saves use expected revision checks. Merge publication computes an explicit diff and enters A05. Stale base requires user-visible rebase/review and new voting.

Approved excursion branches materialize into canonical itinerary items plus wm_branch linkage and participant membership. Main and branch activities share the same logical-item revision scheme. V1 uses the whole-trip electorate for all shared-plan changes, including branches. Branch-specific electorates are a later policy extension.

Routes use actual place coordinates and travel modes. Reordering suggestions preserve opening windows, fixed bookings and must-see semantics and are previews until voted. Do not optimize solely by straight-line distance or interpret the existing prototype's location sketch as live routing.

A public preview strips private stay addresses and exact participant locations. Maps distinguish itinerary stops, reunion points, current location and unknown/stale reports. Keep provider map/content usage consistent with applicable attribution and display terms.

## A11. Media pipeline and biometric scope

1. User requests upload authorization from Core for their trip.
2. Core checks membership, limits and consent; issues a short-lived signed URL for an exact object path.
3. Upload completion checks content type, size and actual object existence; calculate/check content hash and create a deduplicated processing job.
4. SVC-04 claims the job and obtains scoped signed inputs. Validate actual image decoding, bound dimensions/pixel count, handle orientation, remove exposed GPS metadata from served derivatives and create thumbnails.
5. YuNet detects faces; align crops using landmarks; SFace computes embeddings. Pin model files, checksums and license records during setup.
6. Core persists face metadata/embeddings under the trip's consent scope. Do not use a general chat model to name faces.
7. Reference submission requires an authorized user and clear processing consent. Reject/ask selection for zero or multiple reference faces.
8. Compare reference embeddings only with authorized faces in that trip. Use versioned thresholds measured on the demo's representative photos; handle low-quality/unknown results. Candidate confidence is not a universal identity certainty.
9. Persist reviewed matches through Core. Manual corrections override automatic groupings and remain auditable.
10. Collage job uses authorized selected assets, produces a real output image and stores a result reference. Core issues a short-lived download URL.

Core rechecks membership and consent at job claim and result completion. Revoked work is cancelled and derived biometric data is removed according to policy; a worker cannot revive deleted consent with a late result. Raw references and embeddings never appear in ordinary trip events or logs.

Pillow builds collages; face recognition only selects candidates. The system also supports manual collage selection and honest failed/empty states. Private bucket access does not rely on unguessable filenames alone.

## A12. API, events and jobs

### External API shape

All routes use /v1. Mutating requests accept Idempotency-Key where retries can create duplicates. Actor identity is session-derived. Responses carry request_id and relevant revision/sequence. Use 401 unauthenticated, 403 forbidden, 404 for inaccessible private resources, 409 conflict/locked/stale, 422 validation failure, 429 rate limited, and 503 unavailable provider as appropriate.

| Route | Purpose |
|---|---|
| POST /session/bootstrap; GET /me | Map authenticated identity and read own profile |
| GET/PUT /me/passport; POST /onboarding/extractions | Passport review flow; extraction does not auto-save |
| POST /voice/sessions | Short-lived authorized voice configuration |
| POST /trips; GET /trips/:id | Create/read authorized trip |
| PATCH /trips/:id/settings | Presentation/admission settings only; shared-plan-sensitive changes require their own explicit command |
| POST /trips/:id/invites; POST /invites/redeem | Create/redeem controlled admission |
| POST /trips/:id/join-requests; POST /join-requests/:id/review | Request/approve membership |
| POST /trips/:id/members/:userId/remove; POST /trips/:id/ownership-transfer | Audited membership commands |
| GET/PUT /trips/:id/passport/me; GET /trips/:id/genome | Trip overrides and allowed summaries |
| GET /discover/trips; GET /discover/guides | Filtered, scored projections |
| GET /public/trips/:id | Public-safe card and itinerary preview |
| GET /trips/:id/itinerary; GET /trips/:id/history | Authoritative plan and history |
| POST /trips/:id/change-sets/preview; POST /trips/:id/change-sets | Validate/publish one or multiple operations |
| GET /change-sets/:id; POST /change-sets/:id/votes | Decision detail and atomic ballot/commit |
| PATCH /items/:logicalId | Reject locked direct edits; never a force-update shortcut |
| POST /trips/:id/branches; PATCH /branches/:id; POST /branches/:id/merge-proposals | Draft branches and voted merges |
| POST /trips/:id/enquiries; GET/POST /conversations/:id/messages | Explicit-recipient enquiries and persisted chat |
| POST /trips/:id/location-grants; POST /location-grants/:id/revoke | Temporary sharing controls |
| WSS /v1/live | Authorized ephemeral room/position/token events |
| POST /me/emergency-contacts; POST /contact-access-requests; POST /contact-access-requests/:id/respond | Owner-controlled contact access |
| POST /trips/:id/media/uploads; POST /media/:id/complete | Scoped photo upload lifecycle |
| POST /trips/:id/face-references; GET /trips/:id/face-matches | Consented trip-scoped reference search |
| POST /trips/:id/collages; GET /jobs/:id | Asynchronous export and job status |
| POST /reports; POST /blocks; GET/PATCH /notifications | Reporting, blocking and in-app notices |

### Private service API

- POST /internal/jobs/claim, /heartbeat, /complete, /fail: queue-scoped service credentials and job capabilities.
- POST /internal/agent-runs/:id/tool-calls: allowlisted typed tool dispatch; actor/trip fixed by run.
- POST /internal/agent-runs/:id/messages and /events: bounded streaming/final output.
- POST /internal/media-jobs/:id/results: model version, bounded metadata and authorized output references.
- POST /internal/assets/renew: renewed signed asset access after current permission checks.

### Example published proposal request

    {
      "base_itinerary_version": 12,
      "title": "Move lunch and the museum visit",
      "operations": [
        {
          "action": "reschedule",
          "logical_item_id": "wli_example",
          "expected_revision": 2,
          "starts_at": "2026-09-25T07:30:00Z",
          "ends_at": "2026-09-25T08:30:00Z"
        }
      ],
      "requested_closes_at": "2026-09-24T20:00:00Z"
    }

The server chooses electorate, majority threshold, actor and final allowed deadline. The example contains one operation only for brevity; all operations must be visible in a real bundle preview.

### Durable event envelope

    {
      "schema_version": 1,
      "event_id": "wev_example",
      "trip_id": "trp_example",
      "sequence": 42,
      "kind": "decision.committed",
      "resource_id": "wcs_example",
      "itinerary_version": 13,
      "occurred_at": "2026-09-24T14:00:00Z"
    }

Other kinds include membership.changed, proposal.published, vote.recorded, proposal.closed, message.created, genome.updated, media.processed and collage.completed. A notification is a prompt to retrieve authorized state, not an authorization token.

### Jobs

Job queues: core, trippy, media. Types include proposal_expiry, genome_refresh, notification_delivery, agent_run, passport_extract, photo_process, reference_match and collage_render. Jobs transition queued → leased/running → succeeded or retry_wait → failed; cancelled is terminal. Lease heartbeat, bounded attempts, exponential backoff, dedupe keys and poison-job inspection are required. Every claim increments a lease generation; heartbeat, tool/result writes and completion must match the current generation and an unexpired lease. A late worker from a reclaimed lease cannot publish results. Business-command idempotency remains necessary for work completed before a lease was lost. Jobs never rely solely on an in-memory timer.

## A13. Configuration and secrets

The implementation must create a complete .env.example with dummy values and per-service documentation. No secret values belong in these documents, fixtures, Git or frontend build variables.

| Variable family | Consumer | Requirement |
|---|---|---|
| VITE_API_BASE_URL, VITE_WS_BASE_URL | Frontend | Public application endpoints |
| VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY | Frontend | Public provider configuration; permissions still enforced |
| VITE_GOOGLE_MAPS_BROWSER_KEY | Frontend | Browser key restricted by origin and API |
| PORT, APP_ORIGIN, ALLOWED_ORIGINS, LOG_LEVEL | Each service as applicable | Explicit local/hosted values |
| CORE_DATABASE_URL | Core | Least-privilege command/query role |
| MIGRATION_DATABASE_URL | Migration job only | Elevated DDL; never application runtime |
| SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_JWT_ISSUER, SUPABASE_JWT_AUDIENCE | Core | Storage/admin operations and auth validation as required by chosen provider setup |
| TRIPPY_SERVICE_TOKEN, MEDIA_SERVICE_TOKEN | Core and corresponding service | Distinct server-only internal credentials |
| RUN_CAPABILITY_SECRET | Core | Bound short-lived job/run capability issuance |
| CORE_INTERNAL_URL | Trippy/Media | Internal command API address |
| GEMINI_API_KEY, GEMINI_TEXT_MODEL, GEMINI_LIVE_MODEL | Trippy | Verified accessible model identifiers |
| GOOGLE_MAPS_SERVER_KEY | Core provider adapter | Server-restricted Places/Routes credential |
| CONTACT_ENCRYPTION_KEY, CONTACT_KEY_VERSION | Core | Encrypt private contacts; rotation metadata |
| YUNET_MODEL_PATH, SFACE_MODEL_PATH, FACE_MATCH_THRESHOLD | Media | Pinned verified artifacts and measured threshold |
| MEDIA_MAX_UPLOAD_BYTES, MEDIA_MAX_PIXELS, MEDIA_WORKER_CONCURRENCY | Core/Media | Resource bounds |
| JOB_LEASE_SECONDS, JOB_MAX_ATTEMPTS, PROPOSAL_DEFAULT_TTL_SECONDS | Relevant runtime | Documented values in deployment config |
| NOTIFICATION_PROVIDER_* | Core worker | Optional; external delivery explicitly disabled until configured |

Validate configuration at process startup and show a useful readiness error. Keep provider integration status visible to operators. Tests use isolated fixtures/adapters; the final demonstration of AI/face processing must exercise actual selected implementations.

## A14. Verification, operations and quality targets

### Required correctness checks

- Simultaneous decisive votes create exactly one committed version.
- Duplicate HTTP requests do not duplicate votes, proposals, messages or jobs.
- Stale proposals cannot overwrite a newer plan or retain approval after changing content.
- Multi-operation bundles commit all operations or none, with canonical votes mirrored consistently.
- Direct edits fail for organizer, participant and Trippy, including raw API/database-exposure attempts.
- Nonmembers, removed members and wrong-conversation users cannot read private data or mutate a trip.
- Deadline expiry works without connected clients.
- Reconnect recovers missed decisions and ignores duplicate/out-of-order notifications.
- Consent revocation prevents new location delivery and late media results from reintroducing biometric data.
- Match scores are deterministic, money is exact, timezone conversions are correct, missing data stays unknown.
- Face pipeline is tested on consented representative photos; false matches and poor quality are reviewable.
- Canonical export passes supplied conformance validation.

### Engineering targets, not measured claims

- Committed change visible in both connected browsers within one second at p95 on a healthy tested deployment.
- Ordinary cached/private projection API responses under 500 ms at p95 in the tested environment, excluding provider work.
- Long AI/media tasks acknowledge quickly with a durable job ID and honest progress.
- Mobile layouts validated at 360, 390 and 430 CSS pixels; desktop at 1280 and 1440.
- Landing remains usable without animation, reduced-motion users receive a composed static alternative, and large assets do not block primary actions.

Measure before reporting results. Include trace/request IDs across Core, jobs, Trippy tools and Media completion; redact private content and secrets. Record queue depth, job age, provider errors, decision conflicts, realtime lag, upload failures and slow endpoints. Readiness distinguishes database unavailable from optional provider unavailable.

Create repeatable demo fixtures using real current timestamps and separate authenticated accounts. Preserve the supplied dataset separately; do not rewrite historical seed deadlines as if they were original data. Do not commit real participant photos, biometric embeddings or credentials into public demo fixtures.

## A15. Sources and unresolved decisions

The user-supplied current statement and [PRODUCT.md](PRODUCT.md) define scope. Local canonical sources are [schema.sql](../../WanderMatch/data/schema.sql), [data conventions](../../WanderMatch/data/WORKING_WITH_THE_DATA.md), and [field definitions](../../WanderMatch/01_YOUR_DATA_MODEL.md).

Technical documentation consulted for this architecture:

- [Supabase database-change subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini Live ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
- [Google Places details and fields](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [OpenCV YuNet/SFace workflow](https://docs.opencv.org/4.x/d0/dd4/tutorial_dnn_face.html)

Resolve during setup: D1–D9 mapping; hosted account ownership/regions/billing; accessible model IDs; precise provider quotas; permitted temple imagery and model artifacts; privacy retention periods; notification delivery provider. These are explicit dependencies, not reasons to substitute mocked behavior for a claimed completed feature.
