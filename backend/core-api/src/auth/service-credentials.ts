import { createHmac, timingSafeEqual } from "node:crypto";
import type { CoreConfig } from "../config.js";
import { DomainError } from "../domain.js";

export type ServiceAudience = "trippy" | "media";
export interface RunCapability {
  runId: string;
  actorUserId: string;
  tripId: string;
  audience: ServiceAudience;
  actions: readonly string[];
  expiresAt: number;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyServiceCredential(
  config: CoreConfig,
  audience: ServiceAudience,
  presented?: string,
): void {
  const expected =
    audience === "trippy"
      ? config.TRIPPY_SERVICE_TOKEN
      : config.MEDIA_SERVICE_TOKEN;
  if (!expected || !presented || !constantTimeEqual(expected, presented)) {
    throw new DomainError("SERVICE_CREDENTIAL_INVALID", 401);
  }
}

// PR-06 will issue these only after Core authorizes a concrete run. A worker
// receives a narrow, expiring scope; the raw user bearer token is never passed.
export function verifyRunCapability(
  secret: string | undefined,
  encodedPayload: string,
  signature: string,
  audience: ServiceAudience,
  action: string,
  now = Date.now(),
): RunCapability {
  if (!secret || secret.length < 32)
    throw new DomainError("CAPABILITY_CONFIG_MISSING", 503);
  const expected = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  if (!constantTimeEqual(expected, signature))
    throw new DomainError("CAPABILITY_INVALID", 403);
  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    throw new DomainError("CAPABILITY_INVALID", 403);
  }
  if (!value || typeof value !== "object")
    throw new DomainError("CAPABILITY_INVALID", 403);
  const scope = value as Partial<RunCapability>;
  if (
    scope.audience !== audience ||
    !Array.isArray(scope.actions) ||
    !scope.actions.includes(action) ||
    !scope.runId ||
    !scope.actorUserId ||
    !scope.tripId ||
    !Number.isFinite(scope.expiresAt) ||
    (scope.expiresAt as number) <= now
  )
    throw new DomainError("CAPABILITY_INVALID", 403);
  return scope as RunCapability;
}
