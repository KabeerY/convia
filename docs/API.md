# PR-01 API contract handoff

The transport source is `packages/contracts/schemas/domain.schema.json`. Generated TypeScript and Python bindings and `packages/contracts/openapi.yaml` are checked artifacts. Run `pnpm contracts:generate` after a source change and `pnpm contracts:check` before review. The OpenAPI paths describe planned operations; they do not claim that the skeleton implements them.

## Public and internal boundaries

External routes use `/v1`. An authenticated Core route obtains the actor from the verified bearer session and canonical mapping; it does not accept `actor_id` from JSON. Mutating requests that can be retried accept `Idempotency-Key`; commands compare both key and request hash. Responses include `request_id` and relevant revision or event sequence. Public cards are explicit safe projections; membership or authentication alone does not authorize private records. Planned routes and status mappings are in architecture A12.

Trippy and Media use distinct server-only credentials and short-lived, run/job-scoped capabilities. The capability fixes initiating actor, trip, operation, expiry and lease generation. Provider responses and tool arguments are evidence to validate; neither can extend authority. Core remains the only durable write authority.

## Module handoff

`backend/core-api/src/modules/registry.ts` imports each module's owned `index.ts` and calls `register(app, domain)`. Harsh replaces the stub in his owned module path. `DomainPort.resolveContext` is the sole actor source; `authorize` takes a named policy and resource ID; `execute` and `query` call authoritative Core domain entry points. For a chat operation requiring message, mention-job and event in one transaction, use `transaction(context, callback)` and its scoped operations. PR-02 and PR-06 provide real implementations. Until then these methods throw, and unimplemented `/v1` routes return a 503 `MODULE_UNAVAILABLE` envelope.

Provider adapters register behind `backend/core-api/src/providers/registry.ts`: `searchPlaces`, `getPlaceDetails`, and `estimateRoutes`. Their outputs include source, observation time and optional attribution. Harsh owns adapter normalization in PR-11; Akhin owns credential and network restrictions.

The known unresolved contract inputs are the supplied canonical pack, D1–D9 mapping and actual provider-supported fields. PR-02/11 may refine schemas through the single shared source when those inputs are available. No caller should treat illustrative fixture IDs or unknown availability as verified live data.
