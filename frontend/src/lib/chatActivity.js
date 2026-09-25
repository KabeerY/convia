const trippyMention = /(?:^|\s)@trippy\b/i;

export function pendingTrippyRequestCount(
  messages,
  now = Date.now(),
  maxAgeMs = 120_000,
) {
  const pending = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.content_kind === "agent") {
      pending.shift();
      continue;
    }
    if (
      message?.content_kind === "member" &&
      trippyMention.test(String(message.body || ""))
    ) {
      const createdAt = Date.parse(message.created_at);
      if (!Number.isFinite(createdAt) || now - createdAt <= maxAgeMs) {
        pending.push(message.message_id);
      }
    }
  }
  return pending.length;
}

export function isTrippyThinking(messages, now = Date.now()) {
  return pendingTrippyRequestCount(messages, now) > 0;
}
