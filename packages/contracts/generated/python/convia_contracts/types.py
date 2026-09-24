"""Generated from schemas/domain.schema.json. Do not edit."""
from __future__ import annotations
from typing import Literal, NotRequired, TypeAlias, TypedDict

Id: TypeAlias = str

Instant: TypeAlias = str

Date: TypeAlias = str

class Money(TypedDict):
    amount: str
    currency: str

class ErrorEnvelopeError(TypedDict):
    code: str
    message: str
    action: NotRequired[str]

class ErrorEnvelope(TypedDict):
    request_id: Id
    error: ErrorEnvelopeError

class PageRequest(TypedDict):
    cursor: NotRequired[str]
    limit: NotRequired[int]

class RevisionRef(TypedDict):
    logical_item_id: Id
    expected_revision: int

class AddOperation(TypedDict):
    action: Literal["add"]
    new_item: dict[str, object]
    cost: NotRequired[Money]
    cost_basis: NotRequired[Literal["party", "person", "unknown"]]

class RemoveOperation(TypedDict):
    action: Literal["remove"]
    logical_item_id: Id
    expected_revision: int

class ReplaceOperation(TypedDict):
    action: Literal["replace"]
    logical_item_id: Id
    expected_revision: int
    new_item: dict[str, object]
    cost: NotRequired[Money]
    cost_basis: NotRequired[Literal["party", "person", "unknown"]]

class RescheduleOperation(TypedDict):
    action: Literal["reschedule"]
    logical_item_id: Id
    expected_revision: int
    starts_at: Instant
    ends_at: Instant

ChangeOperation: TypeAlias = AddOperation | RemoveOperation | ReplaceOperation | RescheduleOperation

class PublishChangeSetRequest(TypedDict):
    base_itinerary_version: int
    title: str
    operations: list[ChangeOperation]
    requested_closes_at: NotRequired[Instant]

class BallotRequest(TypedDict):
    vote: Literal["yes", "no"]
    expected_revision: int

ChangeSetState: TypeAlias = Literal["open", "committed", "rejected", "expired", "stale", "invalidated"]

class DecisionSummary(TypedDict):
    change_set_id: Id
    state: ChangeSetState
    base_itinerary_version: int
    eligible_count: int
    threshold: int
    yes_count: int
    no_count: int
    closes_at: Instant
    committed_itinerary_version: NotRequired[int]

class EventEnvelope(TypedDict):
    schema_version: Literal[1]
    event_id: Id
    trip_id: Id
    sequence: int
    kind: Literal["membership.changed", "proposal.published", "vote.recorded", "decision.committed", "proposal.closed", "message.created", "genome.updated", "media.processed", "collage.completed"]
    resource_id: Id
    itinerary_version: NotRequired[int]
    occurred_at: Instant

class JobEnvelope(TypedDict):
    job_id: Id
    queue: Literal["core", "trippy", "media"]
    type: Literal["proposal_expiry", "genome_refresh", "notification_delivery", "agent_run", "passport_extract", "photo_process", "reference_match", "collage_render"]
    state: Literal["queued", "leased", "running", "retry_wait", "succeeded", "failed", "cancelled"]
    attempt: int
    lease_generation: int
    lease_expires_at: NotRequired[Instant]
    trip_id: NotRequired[Id]
    run_id: NotRequired[Id]

class ServiceCapability(TypedDict):
    job_id: Id
    run_id: Id
    actor_id: Id
    trip_id: Id
    operation: str
    expires_at: Instant
    lease_generation: int

class GetTripContextTool(TypedDict):
    tool: Literal["get_trip_context"]
    arguments: dict[str, object]
    dedupe_key: str

class SearchPlacesToolArguments(TypedDict):
    query: str
    destination: NotRequired[str]
    radius_meters: NotRequired[int]
    language: NotRequired[str]

class SearchPlacesTool(TypedDict):
    tool: Literal["search_places"]
    arguments: SearchPlacesToolArguments
    dedupe_key: str

class GetPlaceDetailsToolArguments(TypedDict):
    place_id: Id
    fields: list[str]

class GetPlaceDetailsTool(TypedDict):
    tool: Literal["get_place_details"]
    arguments: GetPlaceDetailsToolArguments
    dedupe_key: str

class SearchVenueInformationToolArguments(TypedDict):
    query: str
    place_id: NotRequired[Id]

class SearchVenueInformationTool(TypedDict):
    tool: Literal["search_venue_information"]
    arguments: SearchVenueInformationToolArguments
    dedupe_key: str

class EstimateRoutesToolArguments(TypedDict):
    place_ids: list[Id]
    mode: Literal["walk", "drive", "transit"]
    departure_at: NotRequired[Instant]

class EstimateRoutesTool(TypedDict):
    tool: Literal["estimate_routes"]
    arguments: EstimateRoutesToolArguments
    dedupe_key: str

class PreviewChangeSetToolArguments(TypedDict):
    base_itinerary_version: int
    operations: list[ChangeOperation]

class PreviewChangeSetTool(TypedDict):
    tool: Literal["preview_change_set"]
    arguments: PreviewChangeSetToolArguments
    dedupe_key: str

class CreateChangeSetTool(TypedDict):
    tool: Literal["create_change_set"]
    arguments: PublishChangeSetRequest
    dedupe_key: str

class CreateAlternativeBranchToolArguments(TypedDict):
    source_itinerary_version: int
    title: str

class CreateAlternativeBranchTool(TypedDict):
    tool: Literal["create_alternative_branch"]
    arguments: CreateAlternativeBranchToolArguments
    dedupe_key: str

class UpdateAlternativeBranchToolArguments(TypedDict):
    branch_id: Id
    expected_revision: int
    operations: list[ChangeOperation]

class UpdateAlternativeBranchTool(TypedDict):
    tool: Literal["update_alternative_branch"]
    arguments: UpdateAlternativeBranchToolArguments
    dedupe_key: str

class ProposeBranchMergeToolArguments(TypedDict):
    branch_id: Id
    expected_revision: int
    title: str

class ProposeBranchMergeTool(TypedDict):
    tool: Literal["propose_branch_merge"]
    arguments: ProposeBranchMergeToolArguments
    dedupe_key: str

class ExplainDecisionToolArguments(TypedDict):
    change_set_id: Id

class ExplainDecisionTool(TypedDict):
    tool: Literal["explain_decision"]
    arguments: ExplainDecisionToolArguments
    dedupe_key: str

ToolCall: TypeAlias = GetTripContextTool | SearchPlacesTool | GetPlaceDetailsTool | SearchVenueInformationTool | EstimateRoutesTool | PreviewChangeSetTool | CreateChangeSetTool | CreateAlternativeBranchTool | UpdateAlternativeBranchTool | ProposeBranchMergeTool | ExplainDecisionTool

class PassportCandidate(TypedDict):
    field: str
    value: str
    source: Literal["explicit_form", "user_confirmed_extraction", "unconfirmed_inference", "system_default"]
    confirmed: bool

class GenomeFactor(TypedDict):
    name: str
    score: NotRequired[float]
    coverage: float
    known: bool

class MatchResult(TypedDict):
    trip_id: Id
    eligibility: Literal["compatible", "incompatible", "needs_confirmation"]
    fit_percentage: NotRequired[int | None]
    coverage: float
    factors: list[GenomeFactor]
    score_version: str

class ConversationMessage(TypedDict):
    message_id: Id
    conversation_id: Id
    sender_id: Id
    client_message_id: str
    body: str
    change_set_id: NotRequired[Id]
    created_at: Instant

class Enquiry(TypedDict):
    enquiry_id: Id
    trip_id: Id
    sender_id: Id
    recipient_ids: list[Id]

class LocationGrant(TypedDict):
    grant_id: Id
    trip_id: Id
    owner_id: Id
    recipient_ids: list[Id]
    expires_at: Instant

class ContactGrant(TypedDict):
    grant_id: Id
    contact_id: Id
    owner_id: Id
    recipient_id: Id
    expires_at: Instant

class FaceConsent(TypedDict):
    trip_id: Id
    subject_id: Id
    reference_id: Id
    granted_at: Instant
    revoked_at: NotRequired[Instant]

class MediaResult(TypedDict):
    job_id: Id
    trip_id: Id
    media_id: Id
    state: Literal["processed", "no_face", "failed"]
    model_version: str
    candidate_reference_ids: NotRequired[list[Id]]
