// Generated from schemas/domain.schema.json. Do not edit.

export type Id = string;

export type Instant = string;

export type Date = string;

export type Money = {
  "amount": string;
  "currency": string;
};

export type ErrorEnvelope = {
  "request_id": Id;
  "error": {
  "code": string;
  "message": string;
  "action"?: string;
};
};

export type PageRequest = {
  "cursor"?: string;
  "limit"?: number;
};

export type RevisionRef = {
  "logical_item_id": Id;
  "expected_revision": number;
};

export type AddOperation = {
  "action": "add";
  "new_item": Record<string, unknown>;
  "cost"?: Money;
  "cost_basis"?: "party" | "person" | "unknown";
};

export type RemoveOperation = {
  "action": "remove";
  "logical_item_id": Id;
  "expected_revision": number;
};

export type ReplaceOperation = {
  "action": "replace";
  "logical_item_id": Id;
  "expected_revision": number;
  "new_item": Record<string, unknown>;
  "cost"?: Money;
  "cost_basis"?: "party" | "person" | "unknown";
};

export type RescheduleOperation = {
  "action": "reschedule";
  "logical_item_id": Id;
  "expected_revision": number;
  "starts_at": Instant;
  "ends_at": Instant;
};

export type ChangeOperation = AddOperation | RemoveOperation | ReplaceOperation | RescheduleOperation;

export type PublishChangeSetRequest = {
  "base_itinerary_version": number;
  "title": string;
  "operations": Array<ChangeOperation>;
  "requested_closes_at"?: Instant;
};

export type V0ActivityItem = {
  "title": string;
  "item_type": "hotel" | "flight" | "poi" | "package" | "guide" | "transfer" | "meal" | "free";
  "day_index": number;
  "starts_at": Instant;
  "ends_at": Instant;
};

export type V0AddOperation = {
  "action": "add";
  "new_item": V0ActivityItem;
  "cost_basis"?: "unknown";
};

export type PublishV0ChangeSetRequest = {
  "base_itinerary_version": number;
  "title": string;
  "operations": Array<V0AddOperation>;
  "requested_closes_at"?: Instant;
};

export type BallotRequest = {
  "vote": "yes" | "no";
  "expected_revision": number;
};

export type ChangeSetState = "open" | "committed" | "rejected" | "expired" | "stale" | "invalidated";

export type DecisionSummary = {
  "change_set_id": Id;
  "trip_id": Id;
  "title": string;
  "state": ChangeSetState;
  "status": ChangeSetState;
  "revision": number;
  "base_itinerary_version": number;
  "eligible_count": number;
  "threshold": number;
  "approval_threshold": number;
  "yes_count": number;
  "no_count": number;
  "actor_ballot": "yes" | "no" | null;
  "closes_at": Instant;
  "created_at"?: Instant;
  "operations": Array<ChangeOperation>;
  "committed_itinerary_version": number | null;
};

export type EventEnvelope = {
  "schema_version": 1;
  "event_id": Id;
  "trip_id": Id;
  "sequence": number;
  "kind": "membership.changed" | "proposal.published" | "vote.recorded" | "decision.committed" | "proposal.closed" | "message.created" | "genome.updated" | "media.processed" | "collage.completed";
  "resource_id": Id;
  "itinerary_version"?: number;
  "occurred_at": Instant;
};

export type JobEnvelope = {
  "job_id": Id;
  "queue": "core" | "trippy" | "media";
  "type": "proposal_expiry" | "genome_refresh" | "notification_delivery" | "agent_run" | "passport_extract" | "photo_process" | "reference_match" | "collage_render";
  "state": "queued" | "leased" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled";
  "attempt": number;
  "lease_generation": number;
  "lease_expires_at"?: Instant;
  "trip_id"?: Id;
  "run_id"?: Id;
};

export type ServiceCapability = {
  "job_id": Id;
  "run_id": Id;
  "actor_id": Id;
  "trip_id": Id;
  "operation": string;
  "expires_at": Instant;
  "lease_generation": number;
};

export type GetTripContextTool = {
  "tool": "get_trip_context";
  "arguments": Record<string, unknown>;
  "dedupe_key": string;
};

export type SearchPlacesTool = {
  "tool": "search_places";
  "arguments": {
  "query": string;
  "destination"?: string;
  "radius_meters"?: number;
  "language"?: string;
};
  "dedupe_key": string;
};

export type GetPlaceDetailsTool = {
  "tool": "get_place_details";
  "arguments": {
  "place_id": Id;
  "fields": Array<string>;
};
  "dedupe_key": string;
};

export type SearchVenueInformationTool = {
  "tool": "search_venue_information";
  "arguments": {
  "query": string;
  "place_id"?: Id;
};
  "dedupe_key": string;
};

export type EstimateRoutesTool = {
  "tool": "estimate_routes";
  "arguments": {
  "place_ids": Array<Id>;
  "mode": "walk" | "drive" | "transit";
  "departure_at"?: Instant;
};
  "dedupe_key": string;
};

export type PreviewChangeSetTool = {
  "tool": "preview_change_set";
  "arguments": {
  "base_itinerary_version": number;
  "operations": Array<ChangeOperation>;
};
  "dedupe_key": string;
};

export type CreateChangeSetTool = {
  "tool": "create_change_set";
  "arguments": PublishChangeSetRequest;
  "dedupe_key": string;
};

export type CreateAlternativeBranchTool = {
  "tool": "create_alternative_branch";
  "arguments": {
  "source_itinerary_version": number;
  "title": string;
};
  "dedupe_key": string;
};

export type UpdateAlternativeBranchTool = {
  "tool": "update_alternative_branch";
  "arguments": {
  "branch_id": Id;
  "expected_revision": number;
  "operations": Array<ChangeOperation>;
};
  "dedupe_key": string;
};

export type ProposeBranchMergeTool = {
  "tool": "propose_branch_merge";
  "arguments": {
  "branch_id": Id;
  "expected_revision": number;
  "title": string;
};
  "dedupe_key": string;
};

export type ExplainDecisionTool = {
  "tool": "explain_decision";
  "arguments": {
  "change_set_id": Id;
};
  "dedupe_key": string;
};

export type ToolCall = GetTripContextTool | SearchPlacesTool | GetPlaceDetailsTool | SearchVenueInformationTool | EstimateRoutesTool | PreviewChangeSetTool | CreateChangeSetTool | CreateAlternativeBranchTool | UpdateAlternativeBranchTool | ProposeBranchMergeTool | ExplainDecisionTool;

export type PassportCandidate = {
  "field": string;
  "value": string;
  "source": "explicit_form" | "user_confirmed_extraction" | "unconfirmed_inference" | "system_default";
  "confirmed": boolean;
};

export type GenomeFactor = {
  "name": string;
  "score"?: number;
  "coverage": number;
  "known": boolean;
};

export type MatchResult = {
  "trip_id": Id;
  "eligibility": "compatible" | "incompatible" | "needs_confirmation";
  "fit_percentage"?: number | null;
  "coverage": number;
  "factors": Array<GenomeFactor>;
  "score_version": string;
};

export type ConversationMessage = {
  "message_id": Id;
  "conversation_id": Id;
  "sender_id": Id;
  "client_message_id": string;
  "body": string;
  "change_set_id"?: Id;
  "created_at": Instant;
};

export type Enquiry = {
  "enquiry_id": Id;
  "trip_id": Id;
  "sender_id": Id;
  "recipient_ids": Array<Id>;
};

export type LocationGrant = {
  "grant_id": Id;
  "trip_id": Id;
  "owner_id": Id;
  "recipient_ids": Array<Id>;
  "expires_at": Instant;
};

export type ContactGrant = {
  "grant_id": Id;
  "contact_id": Id;
  "owner_id": Id;
  "recipient_id": Id;
  "expires_at": Instant;
};

export type FaceConsent = {
  "trip_id": Id;
  "subject_id": Id;
  "reference_id": Id;
  "granted_at": Instant;
  "revoked_at"?: Instant;
};

export type MediaResult = {
  "job_id": Id;
  "trip_id": Id;
  "media_id": Id;
  "state": "processed" | "no_face" | "failed";
  "model_version": string;
  "candidate_reference_ids"?: Array<Id>;
};
