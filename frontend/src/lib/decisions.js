export function decisionState(decision) {
  return decision.state ?? decision.status ?? "unknown";
}

export function decisionThreshold(decision) {
  return decision.threshold ?? decision.approval_threshold ?? null;
}

export function ballotRequest(decision, vote) {
  if (vote !== "yes" && vote !== "no") throw new Error("Choose yes or no.");
  if (!Number.isInteger(decision.revision) || decision.revision < 0) {
    throw new Error("This decision needs a server revision before you can vote. Refresh and try again.");
  }
  return { vote, expected_revision: decision.revision };
}
