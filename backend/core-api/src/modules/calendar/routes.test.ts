import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { DomainError } from "../../domain.js";
import type { DomainPort } from "../../module-contract.js";
import { calendarModule } from "./index.js";

test("calendar API binds identity to the session and rejects forged scopes and incomplete changes", async () => {
  const calls: Array<{ name: string; input: unknown; actor: string }> = [];
  const domain: DomainPort = {
    resolveContext: async (request) => {
      if (request.headers.authorization !== "Bearer test")
        throw new DomainError("AUTH_REQUIRED", 401);
      return {
        actor: { userId: "authenticated-user", authSubject: "subject" },
        requestId: request.id,
      };
    },
    authorize: async () => undefined,
    transaction: async () => {
      throw new Error("unused");
    },
    query: async (name, context, resource) => {
      calls.push({ name, input: resource, actor: context.actor.userId });
      return { recommendations: [] } as never;
    },
    execute: async (name, input, context) => {
      calls.push({ name, input, actor: context.actor.userId });
      return { ok: true } as never;
    },
  };
  const app = Fastify();
  calendarModule.register(app, domain);
  app.setErrorHandler((error, _request, reply) =>
    reply
      .code(error instanceof DomainError ? error.statusCode : 500)
      .send({ error: error.message }),
  );
  const activity = {
    title: "Walk",
    item_type: "poi",
    starts_at: "2026-11-01T09:00:00Z",
    ends_at: "2026-11-01T10:00:00Z",
  };
  const payload = {
    branch_id: null,
    item_id: null,
    kind: "add",
    expected_revision: 1,
    activity,
  };
  try {
    const anon = await app.inject({
      method: "GET",
      url: "/v1/trips/trip-a/calendar",
    });
    assert.equal(anon.statusCode, 401);
    const headers = { authorization: "Bearer test" };
    const valid = await app.inject({
      method: "POST",
      url: "/v1/trips/trip-a/calendar/change",
      headers,
      payload,
    });
    assert.equal(valid.statusCode, 200);
    assert.equal(calls[0].actor, "authenticated-user");
    assert.equal((calls[0].input as { trip_id: string }).trip_id, "trip-a");
    for (const forged of [
      { ...payload, organizer_id: "other-user" },
      { ...payload, trip_id: "trip-b" },
      { ...payload, activity: undefined },
      { ...payload, kind: "remove" },
      { ...payload, activity: { ...activity, ends_at: activity.starts_at } },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/trips/trip-a/calendar/change",
        headers,
        payload: forged,
      });
      assert.equal(response.statusCode, 400);
    }
    assert.equal(
      calls.length,
      1,
      "invalid requests must not reach the database command",
    );
    const read = await app.inject({
      method: "GET",
      url: "/v1/trips/trip-a/calendar",
      headers,
    });
    assert.equal(read.statusCode, 200);
    assert.equal(calls[1].name, "calendar.read");
  } finally {
    await app.close();
  }
});
