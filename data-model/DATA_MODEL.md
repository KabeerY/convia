# Convia data model, PR-02

## Provenance and import

Source: the user-supplied `~/Downloads/WanderMatch` organizer pack, model
`v1.1.0-rc1`. Its `SHA256SUMS.txt` passed before import. `schema.sql`,
`enums.json`, the fourteen numbered CSVs, and `validate_conformance.py` are
copied without changing their content. The source SQLite database was used for
audit only; PostgreSQL is seeded from CSV. The supplied conformance tool covers
10 of the 14 included tables (and recognizes 23 global contract tables), so a
pass is not a substitute for our all-table count and constraint checks.

| Canonical table | Imported rows |
|---|---:|
| currencies | 25 |
| languages | 26 |
| countries | 30 |
| cities | 60 |
| tour_guides | 120 |
| users | 1,200 |
| trips | 600 |
| user_interactions | 12,339 |
| user_preferences | 1,200 |
| itineraries | 803 |
| itinerary_items | 8,583 |
| proposals | 274 |
| trip_members | 1,407 |
| votes | 761 |

Pre-import audit: zero broken SQLite foreign keys, zero duplicate trip members,
and exactly one active itinerary for each of 600 trips. Ninety historical
proposals in the sample are still marked `open` after their deadline; they are
preserved as source data, not presented as actionable live proposals. Imported
user emails are example identities and are never auto-linked to Auth accounts.

The organizer's D1–D9 mapping is not present in the supplied pack. It remains
unresolved; Convia does not invent aliases for those datasets.

## Additive extensions

`0002_extensions.sql` adds `wm_*` records for identity, profile provenance,
trip settings/capabilities, invites/admission/removals, passports/matching,
decisions/revisions, outbox/jobs, conversation/media, location/safety and agent
audit. Canonical names, columns, IDs, and legal enums are unchanged.

`0003_commands.sql` adds one-active-main-itinerary and one-active-owner indexes,
and guarded functions for identity bootstrap and trip/member commands. Core
calls these functions with a canonical user ID derived from a verified Supabase
session. The client cannot choose an actor. The runtime DB role has no direct
table privileges. `anon` and `authenticated` have no canonical/extension table
privileges; RLS is enabled. The command owner has a named RLS policy and owns
the `SECURITY DEFINER` functions. The migration role is for deployment only.

All admission paths lock the trip row before checking capacity, role, invite
state, and removal state. Removal blocks re-entry until a manager explicitly
clears it. Ownership must be transferred before an owner can leave. A member's
canonical role remains `owner`/`editor`/`viewer`, while the app role and
delegated permissions live in `wm_member_permissions`.

The trip query function returns a bounded public preview, member-only trip and
membership views, and recipient-scoped conversation and ready-media lists. It
never returns raw contact, location, biometric or private message rows.

## Identity defaults

First verified Auth access creates a fresh `usr_` canonical record and a unique
`auth_subject` mapping. It does not claim an imported example user by email.
Canonical non-null fields use documented technical defaults until onboarding:
first active city by ID, INR, `en-IN`, `mid`, `comfort`, `solo`, and `cold_start`.
`wm_profile_field_state` marks those fields `system_default`, unconfirmed and
private, so matching and public projections must not treat them as preferences.
Concurrent requests for the same Auth UUID are serialized during bootstrap.

## Verification and limitations

The remote Supabase database received the three versioned migrations and the
14 CSVs. A read-only export passed the original conformance checker. Local and
remote transaction-rollback tests verified runtime table denial, distinct
canonical IDs, admission permissions, capacity, removal/re-entry and private
trip access. Two real Supabase Auth fixture users (`pr02-alice@example.com` and
`pr02-bob@example.com`) were created through the supported Admin API, signed in
through the public Auth API, and each received a distinct canonical user through
Core's verified-JWT `/v1/me` endpoint. The second fixture account was denied
access to a private trip created by the first account; that trip was rolled
back. Their passwords and the server-only API key are in the ignored root
`.env`, not source control. The command tests leave no test trips or memberships.

The extension schemas are foundation records for later PRs, not implementations
of decision, messaging, location, media or agent workflows. Harsh's PR-04 owns
HTTP adapters for the callable trip primitives. Initial example identities and
catalogue rows remain synthetic, not live users or availability.
