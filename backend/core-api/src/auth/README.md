Core verifies the Supabase bearer JWT with Auth `getClaims`, checks issuer and
audience, and maps its UUID subject through `wm_auth_identities` to a fresh
canonical `usr_` user. The caller never supplies its own actor. Imported example
users are not real Auth identities. `/v1/me` is the PR-02 bootstrap endpoint.

`service-credentials.ts` provides audience-specific service-token checks and a
signed, expiring run-capability verifier for later worker integration. It fails
closed when credentials are absent. Do not pass user bearer tokens to workers.

Named policy checks live in `domain.ts`. Generic membership is intentionally
insufficient for contact, location, conversation or media access; those policies
remain denied until their resource-specific implementations arrive.
