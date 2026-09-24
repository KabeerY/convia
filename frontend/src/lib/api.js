const base = (import.meta.env.VITE_API_BASE_URL || "/v1").replace(/\/$/, "");

export async function core(path, { token, method = "GET", body, signal } = {}) {
  if (!token) throw new Error("Your session has ended. Please sign in again.");
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "GET" ? {} : { "Idempotency-Key": crypto.randomUUID() }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("The trip service is unreachable. Check the connection and try again.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        (response.status === 503
          ? "This part of the trip service is not available yet."
          : `Request failed (${response.status}).`),
    );
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload?.data ?? payload;
}

export function describeError(error) {
  const known = {
    AUTH_REQUIRED: "Your session has ended. Please sign in again.",
    INVALID_SESSION: "Your session has ended. Please sign in again.",
    MEMBERSHIP_REQUIRED: "You are not a member of this trip yet.",
    TRIP_FULL: "This trip has reached its member limit.",
    INVALID_INVITE: "This invitation is invalid, expired, or has been used up.",
    ADMISSION_FORBIDDEN: "Only a trip organizer can do that.",
    STALE_VERSION: "The plan changed. Refresh it and create a new proposal.",
    ITEM_LOCKED: "This item is locked. Raise a proposal to change it.",
  };
  return known[error?.code] || error?.message || "Something went wrong. Please try again.";
}
