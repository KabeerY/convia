# Calendar and branch implementation

The main repository remains the source of styling and backend truth. No prototype files were changed.

## Implemented behavior

- Full-width time-scaled calendar, hourly labels, quarter-hour placement snapping, desktop drag-to-propose moves across days, and desktop recommendation dragging.
- Mobile shows one selected day; a day without branches fills the available width without horizontal scrolling. Touch dragging is disabled. Empty-slot taps and the Add Activity button open a bottom sheet; desktop uses a popover.
- Recommendations are persisted per trip and served by the authenticated calendar API. Sample records are identified as samples. The schema accepts a future `trippy` source; no recommendation-generation service or photos were added.
- Branches are confirmed immediately. They hold multiple activities, have an organizer, and allow self-selected membership. Nesting is limited to five levels below the main plan. Branches can cross dates and locations, with an existing parent activity or custom time/place as the rejoin point. Child branches must fit inside the parent window.
- Organizer edits on a solo branch apply directly. Shared branch edits become proposals with a frozen electorate, majority threshold, organizer (or trip-organizer) approval, and optimistic revision checks. Members can suggest changes but cannot directly overwrite a branch. Trip organizers can manage branches.
- Joining a branch defaults to attending its activities; deeper paths suppress overlapping parent attendance. Individual opt-outs persist. Branch activity ballots also set attendance; general question ballots do not. Main-plan attendance stays independent of approval voting.
- Main-plan add/edit/remove operations require group voting and increment the existing itinerary version. Pending additions/moves are separate preview cards. Questions have votes and replies, but are never converted into calendar changes.
- Calendar discussions and the Decision Room share the same records. Existing SSE change notifications and five-second fallback refresh both surfaces. Source/rejoin changes flag affected branches for review. Cancellations include descendants and affected voters.
- Existing approved V0 forks remain visible as legacy paths; they are not automatically converted to the new editable branch entities. Existing Trippy chat proposals retain their previous route and voting behavior.

## Backend

Migrations `0008` through `0011` were applied to the configured Supabase database during implementation. Later migrations retain fixes without modifying checksums of applied migrations.

`GET /v1/trips/:trip_id/calendar` returns the calendar version, actor, branches, activities, effective attendance, recommendations, proposals, and replies.

`POST /v1/trips/:trip_id/calendar/{branch.create,branch.join,branch.review,change,vote,withdraw,attendance,question,reply}` handles mutations. Identity comes from the session, not request fields. Runtime has no direct table access. Commands serialize on the same trip/itinerary locks as existing decision commands and emit history/outbox records.

## Validation

- Frontend unit tests: timezone conversion (including nonexistent DST times), snapping, overlapping-event layout, nested ordering, and existing tests pass.
- Production frontend build, Core typecheck, and targeted Biome checks pass.
- API tests reject unauthenticated access, forged identity/scope fields, incomplete changes, and invalid time ranges.
- Supabase integration tests use the actual restricted runtime role and roll back every fixture. They cover immediate branch creation, direct solo edits, shared voting, stale revisions, attendance, questions/replies, depth limits, time bounds, source review flags, nested cancellation, main-plan removal, and denied direct table reads.
- The authenticated Manali trip was opened against the real backend; its calendar, branch column, and three backend-served recommendations loaded successfully.
- Responsive browser checks use the real calendar component. A 390px phone viewport was verified to have identical scroll/client widths on a day without branches. Activity details, add sheets, and recommendation-prefilled forms were inspected. Temporary visual fixtures were removed afterward.

## Remaining integration checks

- Full two-account browser workflow, including reconnect behavior, remains to be exercised.
- Real Trippy recommendation generation is not connected; records are sample data as requested.
- Travel times and routing are not calculated. Locations and travel activities are entered manually.
