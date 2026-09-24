`DomainPort.query(name, context, tripId)` exposes these PR-02 projections:

- `trip.list` — only the actor's active memberships (no trip ID needed)
- `trip.public_preview` — bounded title/dates/destination/description for a
  public trip; never member identities or notes
- `trip.read` — trip, settings and active main itinerary for an active member
- `trip.members` — active members with display names and app roles
- `trip.join_requests` — pending requests, organizer/co-organizer only
- `conversation.list` — only conversations where the actor is an active recipient
- `media.list` — ready media metadata for an active trip member; no object keys

Contact, location and biometric projections are intentionally unavailable until
their resource-specific policy and consent checks ship. Raw tables are not an
acceptable shortcut for HTTP handlers.
