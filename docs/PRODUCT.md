# Convia — Product Specification

Version: 1.0 · 24 September 2026 · Team: pacmen · Challenge: WanderMatch / PS-11

Status: implementation specification, not a claim that these features are already built. The team is starting with no configured service accounts or credentials. The existing Convia prototype is a browser-local design reference.

Companion documents:

- [ARCHITECTURE.md](ARCHITECTURE.md): service ownership, data model, security, APIs, transactions and infrastructure.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): ordered implementation steps, dependencies, deliverables and acceptance checks.

The feature IDs P01–P18 below are used in both companion documents. Changes to product behavior must be reflected in all three documents.

## 1. Product purpose and positioning

Convia helps people find compatible travel companions, plan collaboratively, and coordinate a trip together. Its conversational agent is named **Trippy**.

The core promise is: **find your people, agree on a plan, and travel together**. A user may arrive with an existing group, an existing trip, or only travel preferences and available dates. Public groups provide discovery and join requests; private groups provide the same planning tools without public exposure.

The product supports local outings, day trips and longer journeys. Festivals are one use case, not the product's defining market. The current build centers group travel, not a general solo itinerary chatbot, a booking marketplace, or a dating product.

The intended experience is ambitious: cinematic travel discovery; optional intelligent onboarding; explainable matching; shared live plans; votes with real consequences; a useful tool-using agent; meaningful group branching; live trip coordination; and searchable shared memories.

### Product decisions already established

- Build a fresh application in the required repository structure.
- Use the old prototype as a design and interaction reference, not as the authoritative backend.
- Mobile is the primary usage surface; desktop is fully supported and is also a judging surface.
- Trippy's itinerary mutations require group voting, just like human proposals.
- Organizers cannot bypass decision locks.
- Passport onboarding is optional; missing preferences must remain distinguishable from confirmed preferences.
- Face matching and gender representation are separate features. Never infer gender from faces, names or AI-context imports.
- The discarded product-discovery skill and earlier provisional product directions are not requirements for this build.

## 2. Official problem and mandatory proof

### Required problem coverage

1. Create a group trip and invite members.
2. Collaboratively add itinerary items with real-time presence and updates.
3. Propose and vote on changes, with results reflected in the plan.
4. Match solo travellers to compatible public groups or guides using interests, travel style and dates.
5. AI consensus planning is a stretch in the organizer statement and an intended Convia capability.
6. Trip photo collage with face-based segregation is part of the supplied expected MVP list.

### Mandatory enhancement: vote-to-commit and lock

Each proposal has a defined approval rule and/or deadline. Passing the rule automatically applies the approved change to the shared itinerary. A committed item locks against direct edits. Subsequent changes require a new passed proposal. Per-item history records proposer, individual votes and commit time. Removed or superseded itinerary records remain visible with their status.

The decision lock defines who is authorized to change an item. It does not itself resolve concurrent edits; version checks and database transactions do that separately.

### Observable judging proof

Two independent authenticated browsers view the same trip. A proposal reaches its approval threshold. Both update without manual refresh and display the locked item. A direct edit is refused with “This item is locked. Raise a proposal to change it.” History displays the proposal and votes. This must work through real server state, not shared local storage or a staged animation.

## 3. People, group modes and permissions

### People

- **Solo traveller:** discovers public trips, compares fit, asks an organizer questions, requests membership, then becomes a participant.
- **Organizer:** creates a trip, controls membership and publication, delegates co-organizers, and participates in decisions.
- **Co-organizer:** manages join requests, enquiries and delegated trip administration. Does not automatically own the trip or see private participant data.
- **Participant:** maintains their trip Passport, proposes and votes, chats, joins activities, contributes photos and controls location/contact sharing.
- **Read-only guest:** optional explicitly invited viewer. No voting or mutation rights.
- **Guide:** discoverable supply entry. A guide is not a group member merely because their catalogue entry appears in an itinerary.

### Group modes

- **Private:** discoverable only through authorized invitations; private trip data is never included in public search.
- **Public:** publishes a deliberately selected trip card and itinerary preview. Membership can still require approval.
- A public trip is not a public chat room and does not expose live member locations, emergency contacts or accommodation details by default.

### Permission rules

| Action | Organizer | Co-organizer | Participant | Guest/nonmember |
|---|---|---|---|---|
| Edit trip presentation and admission settings | Yes | Delegated | No | No |
| Approve join requests | Yes | Delegated | No | No |
| Remove ordinary participants | Yes | Delegated | No | No |
| Transfer ownership / change privileged roles | Yes | No | No | No |
| Propose and vote on shared plan | Yes | Yes | Yes | No |
| Directly edit a committed item | No | No | No | No |
| Edit own unpublished alternative | Yes | Yes | Yes | No |
| Read private group chat | Member | Member | Member | Only if explicitly granted |
| Read another person's emergency contact | Explicit grant | Explicit grant | Explicit grant if supported | No |
| See live location | Explicit authorized sharing | Same | Same | No |

Leaving or removal stops future private access. Historical proposals and votes remain attributable. Ownership transfer must complete before the last organizer leaves. A removed member cannot re-enter through an old invite without a new authorized admission.

## 4. Feature catalogue

### P01 — Landing, authentication and mobile application shell

The signed-out landing uses Kailasa Temple at Ellora as its visual subject. Scrolling opens stylized entrance layers and reveals the temple architecture, with concise travel taglines beside the composition. Treat the door animation as a cinematic interface interpretation, not a documentary claim about the monument.

Use restrained Indian architectural influence in framing, proportion and ornament. Preserve the prototype's warm paper, charcoal, teal and coral direction. Avoid making every operational screen a heavily decorated landing page.

Provide visible Create a trip and Find your group actions, sign-in, sign-out, session expiry and account recovery. A returning signed-in user should reach their active trip quickly.

Mobile requirements: intentional portrait composition, no horizontally overflowing cards, accessible touch targets, keyboard-safe chat input, bottom navigation, safe-area spacing, readable contrast, reduced-motion behavior, and a useful landing state before large media loads.

Acceptance: real separate sessions; refresh preserves identity; all primary flows work at narrow mobile widths and desktop widths.

### P02 — Three onboarding routes and global Passport

1. **Import AI context:** paste a travel-focused excerpt from another assistant. Extract proposed fields, show their evidence/source, let the user edit or discard them, then save confirmed selections. No automatic access to another AI account is assumed.
2. **Talk or type:** interactive conversation asks useful follow-up questions. Voice supports interruption, transcript review, microphone errors and a text continuation path.
3. **Skip:** proceed with destination, dates and optional interests/filters. Passport completion is never required merely to browse.

Global Passport fields can include interests, pace, travel style, languages, preferred group size, social energy, budget preferences, dietary needs, accessibility requirements, transport preferences, pets and preferred activity times. Sensitive or private fields are optional and visibility-controlled.

Do not import unrelated personal history or infer protected traits from conversational context. An inferred preference remains unconfirmed until reviewed. Technical defaults required by canonical non-null fields are excluded from matching and Genome calculations until confirmed.

Acceptance: all three paths reach useful discovery; extraction is reviewable; a skipped Passport is shown as incomplete rather than silently fabricated.

### P03 — Create, invite, join and manage a trip

Create a trip with title, origin, destination, dates, timezone, currency, capacity, visibility, description, cover, expected budget basis, travel style and admission policy. Create the organizer membership and initial itinerary together.

Support invite links, join codes, expiry, usage limits, revocation and shareable public trip links. Joining a private trip requires valid authorization. Joining a public trip can require an introduction and organizer approval. Approval must recheck capacity atomically.

Show request states: pending, accepted, declined, withdrawn and expired. Repeated clicks must not produce duplicate memberships. Provide leave/remove, co-organizer delegation, ownership transfer, trip cancellation, completion and retained history.

Acceptance: a new authenticated user joins through a valid code or approved request and receives the correct permissions; private groups never appear in discovery.

### P04 — Trip-specific Passport and Group Genome

A trip Passport overlays the global Passport with the user's preferences for this particular journey. A normally adventurous traveller can choose a relaxed trip; a global budget is not automatically a spending commitment.

Trip fields include available dates/time windows, per-person budget and currency, pace, interests, must-do experiences, dietary/accessibility requirements, travel/room-sharing preferences, social preferences and public-sharing choices. Distinguish hard constraints, soft preferences, and missing information.

The Genome is derived from accepted active members. It records distributions and compatible overlaps: for example, three relaxed members and two packed-schedule members. It must not flatten everyone into an average person or publish exact private budgets.

Show a public-safe summary separately from the member-facing summary. A candidate can preview their fit without becoming a member or changing the actual Genome. Recompute on membership and confirmed preference changes; record the source revision and freshness.

Acceptance: trip overrides take precedence; private inputs do not leak through explanations; candidate previews do not mutate the group.

### P05 — Discovery, matching, public cards and guides

Discovery first checks eligibility, then ranks eligible or explicitly needs-confirmation candidates. Inputs include dates, destination, capacity, trip style, interests, budget estimates and declared requirements.

Each result shows a trip fit score, Passport-to-Genome factors, reasons, mismatches and information coverage. The score is a transparent heuristic, not a measured probability of friendship or safety. Sparse profiles must not receive perfect-looking confidence.

Cards include dates, destination, capacity, planned highlights, organizer, estimated costs with basis/currency, fit reasons and join action. Users can inspect the public itinerary and send a private enquiry to an organizer/co-organizer without entering group chat.

Display women’s representation only from voluntary self-description and consent to aggregate publication. Show the percentage together with its denominator and missing-data context: “50% publicly self-described women — 3 of 6 active members; 2 have not shared gender.” The percentage is consenting publicly self-described women divided by all active members, not an estimate of undisclosed identities. Show unavailable for an empty group and count pending requests separately. Never infer undisclosed gender or equate representation with guaranteed safety.

Include guide discovery by city, languages, specialization and documented price. The supplied catalogue has no verified live availability feed: show availability as unknown until explicitly confirmed. Adding a guide to a plan does not book them.

Acceptance: private/full/closed groups are handled correctly; scores are reproducible and explained; guide and gender claims match available evidence.

### P06 — Shared live itinerary

One canonical trip plan powers agenda, calendar, map, public preview and history. Desktop can display multiple day/branch lanes; mobile leads with one selected day and expandable activity cards.

Activities include title, location, time, duration, travel leg, cost basis, participants, source and status. Members add suggestions and propose edits, removals, replacements or rescheduling. Dragging a committed item opens a reschedule proposal instead of silently changing it.

Show presence, pending decisions, committed/locked states, stale proposals, last synchronization and connection state. Reconnect restores authoritative data. No offline screen may claim a server commit that has not occurred.

Acceptance: a mutation from one browser is reflected in another without refresh; reload and reconnect preserve the same itinerary version.

### P07 — Vote-to-commit, lock and decision history

The standard rule is an absolute majority of a frozen eligible electorate: floor(N/2)+1 yes votes. Abstain and no response are not yes votes. Proposing does not automatically cast a yes vote. A single-member trip still requires that member's explicit vote.

When the threshold is reached before the deadline, the approved change commits immediately and locks. Otherwise the deadline closes it without applying. Ties never pass. Deadlines use server time. New members are excluded from an already published electorate. Departed members cannot cast new votes; their already-cast votes remain, and their departure does not lower the denominator.

Votes can change before finalization and their changes are audited. Published proposal content, electorate and threshold cannot be edited in place. A changed proposal requires new voting.

Multi-item suggestions and branch merges can be presented as a clearly labeled all-or-nothing proposal bundle. One group decision approves every listed operation; all apply in one transaction or none apply.

History for each logical activity shows its lineage: proposal, initiating person, whether Trippy assisted, exact proposed change, eligible voters, each vote/abstention/non-response, time of commit and replacement/removal status. Superseded items remain inspectable. Other members see votes as required by the challenge; private Passport data and private vote comments remain separately protected.

Organizers and Trippy have no unlock bypass. Reversing a decision uses a compensating proposal. Concurrent or stale content cannot inherit votes through an automatic rebase.

Acceptance: the complete organizer-required two-browser proof and API-level edit refusal pass.

### P08 — Group chat, private enquiries and notifications

Trip chat contains human messages, Trippy messages, proposal cards, commit notices and useful trip updates. Support persistent ordering, duplicate-send protection, pagination, unread state, mentions, reconnect and visible failures.

Organizer enquiries are separate conversations with explicitly authorized recipients. They are not copied to the trip chat. An organizer handover does not silently expose private enquiry history to a new person.

Notifications cover invitations, request decisions, mentions, new proposals, imminent deadlines, commits, location/contact grants and media completion. Start with in-app notifications; external notifications require configured providers and user preferences.

Acceptance: private enquiries stay private; retried messages do not duplicate; committed proposal cards update in chat and itinerary consistently.

### P09 — Trippy agent and grounded travel assistance

Members invoke @Trippy in chat. Trippy can read authorized trip context, search places, answer venue questions, compare alternatives, create proposals, work with forks and explain decisions.

Read-only information requests execute without voting. Shared-itinerary changes always produce typed proposal cards and use P07. Trippy cannot vote for members, accept a proposal, unlock an item, remove a person, publish live locations or obtain emergency contacts through a general chat request.

Venue answers should use place data and source pages for opening/closing hours, contacts, accessibility, pet policies and other requested facts. Show unknowns, source links and freshness. “No dog-policy information found” is different from “dogs prohibited.” Current hours do not guarantee a distant future date's hours.

Show distinct states: researching, drafting, proposed, awaiting votes, committed, failed and cancelled. “Committed to itinerary” does not mean booked or paid.

Acceptance: one live sourced answer and one real tool-created proposal work in English and an Indian-language/Hinglish interaction, with permissions enforced by the backend.

### P10 — Consensus and alternative-plan forks

Trippy can create several workable options that show time, cost, travel and preference tradeoffs. Deterministic validation checks the proposed schedule and declared constraints. Do not silently exclude a difficult member to improve an aggregate score.

An alternative-plan fork is a private or explicitly shared sandbox with its source revision. A member can edit it without changing the committed itinerary. A merge preview shows additions, removals, replacements and timing changes. Publishing the merge creates a P07 bundle. If the source changed, the member reviews/rebases the fork and obtains fresh approval.

Acceptance: a fork is independently editable; the main plan changes only after its merge proposal passes; stale merges preserve history and cannot overwrite current decisions.

### P11 — Subgroup excursions and reunion

A subgroup excursion is different from an alternative draft: it represents members doing different real activities during the same period. Store participants, departure point/time, branch activities and a reunion point/time. Preserve the main group's visible structure.

For the first release, all changes to the shared itinerary, including subgroup insertion and reunion, use the whole trip's voting rule. Participant-specific voting can be added later with explicit scope rules; it must not be silently enabled for changes to shared transport, costs or meeting times.

Participation and shared-cost consequences must be explicit. Splitting a route does not remove someone from the trip.

Acceptance: overlapping branches render correctly on mobile/desktop and map; the reunion is feasible and all accepted modifications use P07.

### P12 — Map, route suggestions and live coordination

Show itinerary stops, day routes, branch routes, meeting points and the locations of members who actively share. Distinguish planned location from actual reported location. Display timestamp, accuracy and stale/unavailable states.

Location sharing is per trip, time-limited, revocable and independent of membership. A user can choose manual check-in instead. Joining a group never starts tracking automatically. Stop future access when grants expire or membership changes.

Support catch-up navigation and suggested meeting points. Route improvements account for fixed bookings, opening windows, travel mode and group constraints; changing the itinerary creates a voted proposal.

The web release supports foreground location sharing. Reliable locked-phone/background tracking is a separate native-mobile capability and must not be represented as implemented by a PWA alone.

Acceptance: two devices can share authorized foreground positions; stop sharing and removal stop future delivery; optimized routes never bypass votes.

### P13 — Emergency contacts, check-ins and reporting

Participants maintain their own emergency contacts. Organizers/co-organizers can request access for a particular trip and purpose. The owner grants a named recipient, scope and expiry or declines. Access is logged and can be revoked. Organizer status does not confer blanket access.

Provide trusted-contact sharing, optional timed check-ins, reporting and blocking. Emergency assistance can expose a user-initiated call action and selected contact information. Automated SMS/notification escalation remains explicitly unavailable until its delivery provider and user consent are configured and tested.

Do not claim police dispatch, guaranteed rescue, a staffed 24-hour response operation, or that identity verification proves someone safe. Identity checks and moderation are distinct capabilities. Blocking must be considered during matching and shared-trip admission without exposing who blocked whom.

Acceptance: ungranted contacts cannot be read by organizer, participant, Trippy or outsider; expiry/revocation work; live emergency services are never called in tests.

### P14 — Shared photos, reference matching and collages

Members upload authorized trip photos to private storage. Show upload and processing progress. Detect multiple faces per image, create embeddings, and let an authorized user provide a reference image to retrieve likely matches within that trip's authorized album.

Matching returns candidates with review controls, not unquestionable identity declarations. Handle no face, multiple reference faces, low-quality images, false matches, duplicates and failed processing. Do not identify unknown strangers or search across unrelated trips.

Users can select matched or manually chosen photos, generate a collage, preview it and download it. A person with no matching images receives an honest empty state. Face-based search is opt-in and separately revocable; biometric references can be deleted without deleting itinerary decision history.

Acceptance: a real uploaded group-photo set yields reference-person results, correction works, and an actual downloadable collage is produced.

### P15 — Reliability, accessibility and operational experience

Handle loading, empty results, expired invites, full trips, denied permissions, offline status, missed events, stale proposals, provider failures, quota limits and upload failures. Do not replace failures with fake success or fabricated live data.

Support keyboard navigation, visible focus, readable contrast, screen-reader labels, reduced motion and narrow-width testing. All displayed times respect trip timezone while storing instants with offsets. Monetary values retain currency and cost basis.

Acceptance: a clean checkout can run, independent sessions recover after interruption, and failures produce actionable UI states.

### P16 — Form a group around a feasible outing: expansion

With explicit opt-in, a user can provide interests, dates, starting area and budget without selecting an existing trip. Convia can identify compatible willing users and propose an outing. Invitations and acceptance establish membership; the agent never silently signs strangers up.

This is part of the broader product vision, not a prerequisite for demonstrating the required public-group matching flow. It depends on P02–P09 and sufficient real local participation.

### P17 — Join one activity / group-to-group participation: expansion

An otherwise private group may choose to publish a specific activity with limited capacity. A traveller or another group can request participation in that activity without accessing the private trip. This requires activity-scoped membership, conversations, visibility and voting rules; ordinary trip membership must not be reused as an access shortcut.

Depends on P03, P05, P07, P08 and P11. It is distinct from an alternative-plan fork and from opening the entire trip.

### P18 — Saved wishes and future opportunities: expansion

With consent, Convia can connect saved interests and experiences with future trip opportunities or mutually available friends. Suggestions remain dismissible; no automatic outreach or booking is assumed. Trip feedback can refine confirmed preferences without covert personality scoring.

Depends on the established Passport, matching and notification systems. Growth and monetization hypotheses are not evidence of current demand or implemented functionality.

## 5. Navigation and end-to-end journeys

### Primary navigation

- Signed out: landing, public discovery/preview, authentication.
- Signed in: Discover, My Trips, Passport, notifications.
- Trip: overview/Genome/members, Plan, Chat, Map, Memories, settings and history.
- Private enquiry: separate conversation opened from a public trip card.

### Existing private group

Authenticate → create private trip → invite members → optional trip Passports → propose activities → vote → live commit and lock → ask Trippy for alternatives → vote on a change → travel/map coordination → upload and find photos → collage.

### Solo traveller

Choose onboarding path → search with preferences → inspect fit and public plan → enquire privately → request admission → organizer approval → trip Passport → participate in planning and voting → coordinate and contribute memories.

### Public organizer

Create trip → prepare public preview → set capacity/admission expectations → review candidates and enquiries → accept participants → inspect evolving Genome → use Trippy to help reconcile preferences → manage the trip without bypassing decisions.

## 6. Release scope and success criteria

P01–P15 define the intended full build. Their implementation order is based on dependencies, not an assertion that every feature is already finished. P16–P18 preserve the wider vision and require their own verified delivery milestones.

The first integrated milestone must prove P03/P06/P07 with real sessions. The completed experience should also demonstrate matching, Trippy, branching, maps, participant controls and memories. Track actual completion in the implementation plan; do not call mocked behavior live.

Success measures include: decision correctness; cross-browser convergence; organizer effort saved on a real workflow; understandable match explanations; sourced answers; successful photo retrieval with reviewed false matches; and task completion on mobile. Reliability targets in ARCHITECTURE.md are engineering targets, not measured results.

## 7. Outstanding organizer and external dependencies

- The README contract is supplied in [HACKATHON.md](../HACKATHON.md); the repository README follows its eight sections and distinguishes implemented from planned features.
- The new repository description mentions D1–D9; the local PS-11 package contains 14 named tables. Do not invent the D1–D9 mapping.
- Local legacy material mentions an XR requirement hosted in the organizer app. The latest user-supplied statement does not specify one; confirm only if current organizers require it. Do not silently add XR to scope.
- Provider accounts, billing, model access, keys, deployment URLs and photo-model artifacts are not provisioned yet.
- This document does not establish access to private competitor products or validate a commercial business model.

## 8. Source context

Primary requirements are the user's hackathon-day statement and mandatory enhancement in this conversation. Supporting local sources:

- [Canonical data model](../../WanderMatch/01_YOUR_DATA_MODEL.md)
- [Canonical SQL](../../WanderMatch/data/schema.sql)
- [Data conventions](../../WanderMatch/data/WORKING_WITH_THE_DATA.md)
- [Hackathon process](../../WanderMatch/04_HACKATHON_DAY_PROCESS.md)
- [Existing prototype architecture](../../convia-prototype/docs/architecture.md)

Where older material conflicts with the newly supplied mandatory enhancement, use the current enhancement and record the reconciliation while preserving canonical schema semantics additively.
