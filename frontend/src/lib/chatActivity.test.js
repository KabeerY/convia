import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrippyThinking,
  pendingTrippyRequestCount,
} from "./chatActivity.js";

const now = Date.parse("2026-09-25T04:00:00Z");

test("Trippy thinks while a shared mention is unanswered", () => {
  const messages = [
    {
      message_id: "msg_1",
      content_kind: "member",
      body: "@Trippy find us a calm dinner",
      created_at: "2026-09-25T03:59:30Z",
    },
  ];
  assert.equal(isTrippyThinking(messages, now), true);
});

test("an agent answer clears one pending mention", () => {
  const messages = [
    {
      message_id: "msg_1",
      content_kind: "member",
      body: "@Trippy compare these routes",
      created_at: "2026-09-25T03:59:20Z",
    },
    {
      message_id: "msg_2",
      content_kind: "member",
      body: "@Trippy suggest a backup",
      created_at: "2026-09-25T03:59:30Z",
    },
    { message_id: "msg_3", content_kind: "agent", body: "Route one is calmer." },
  ];
  assert.equal(pendingTrippyRequestCount(messages, now), 1);
});

test("stale unanswered mentions do not leave Trippy thinking forever", () => {
  const messages = [
    {
      message_id: "msg_1",
      content_kind: "member",
      body: "@Trippy are you there?",
      created_at: "2026-09-25T03:50:00Z",
    },
  ];
  assert.equal(isTrippyThinking(messages, now), false);
});
