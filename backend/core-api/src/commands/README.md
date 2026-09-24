PR-02 trip/member commands are callable through `DomainPort.execute(name, input,
context)`. `context` comes from `resolveContext(request)`, never request JSON.
PR-04 owns HTTP validation and adapters, not direct table writes.

| Name | Required input | Result |
|---|---|---|
| `trip.create` | `title`, `destination_city_id`, `start_date`, `end_date`, `capacity`, `admission_policy`; optional `origin_city_id`, `visibility`, `timezone`, `home_currency`, `description`, `notes` | trip, itinerary, member IDs |
| `trip.settings` | `trip_id`; optional visibility, capacity, admission policy, description | updated flag |
| `invite.issue` | `trip_id`, `target_role` (`participant`/`guest`), `expires_at`, `max_uses` | invite ID and one-time raw code |
| `invite.redeem` | `trip_id`, raw `code` | member ID |
| `invite.revoke` | `trip_id`, `invite_id` | revoked flag |
| `admission.request` | `trip_id`; optional introduction | pending request or accepted member |
| `admission.withdraw` | `trip_id`, `request_id` | withdrawn state |
| `admission.review` | `trip_id`, `request_id`, decision (`accepted`/`declined`) | review state and optional member ID |
| `member.leave` | `trip_id` | inactive member |
| `member.remove` | `trip_id`, target `user_id` | inactive member and removal barrier |
| `member.restore` | `trip_id`, target `user_id` | re-entry eligibility; does not auto-admit |
| `member.delegate` | `trip_id`, target `user_id`, `app_role` (`participant`/`co_organizer`) | app role |
| `ownership.transfer` | `trip_id`, active target `user_id` | new owner ID |

Every admission route takes a trip-row lock and rechecks capacity and removal.
Codes are stored only as SHA-256 digests; never log the one-time raw code.
PostgreSQL domain exceptions use uppercase codes such as `TRIP_FULL`,
`MEMBERSHIP_REQUIRED`, `INVALID_INVITE`, and `REMOVED_MEMBER`. PR-04 should map
these to stable HTTP responses without weakening the underlying check.
