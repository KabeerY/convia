import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../app.js";
import { readConfig } from "../../config.js";
import type { DomainPort } from "../../module-contract.js";

test("discovery ranks filtered records using confirmed Passport fields", async () => {
  const domain: DomainPort = {
    resolveContext: async () => ({
      actor: { userId: "usr_test", authSubject: "subject" },
      requestId: "test",
    }),
    authorize: async () => undefined,
    transaction: async (_context, run) =>
      run({
        id: "test",
        authorize: async () => undefined,
        execute: async () => ({}) as never,
        query: async () => ({}) as never,
      }),
    execute: async () => ({}) as never,
    query: async (name) => {
      if (name === "v0.passport.read")
        return {
          confirmed_fields: {
            interests: ["Nature"],
            pace: "balanced",
            budget_band: "mid",
          },
        } as never;
      if (name === "v0.discover.list")
        return [
          {
            trip: { trip_id: "trp_a", start_date: "2026-10-01" },
            profile: {
              interests: ["Food"],
              pace: "active",
              budget_band: "premium",
            },
          },
          {
            trip: { trip_id: "trp_b", start_date: "2026-10-02" },
            profile: {
              interests: ["Nature"],
              pace: "balanced",
              budget_band: "mid",
            },
          },
        ] as never;
      return {} as never;
    },
  };
  const app = await buildApp(readConfig({}), domain);
  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/discover/trips?destination_city_id=cty_9327d518",
      headers: { authorization: "Bearer test" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().trips[0].trip.trip_id, "trp_b");
    assert.ok(
      response
        .json()
        .trips[0].match_reasons.some((reason: string) =>
          reason.includes("nature"),
        ),
    );
  } finally {
    await app.close();
  }
});

test("calendar move publishes an intent; unconfigured Trippy does not fake a model action", async () => {
  const commands: Array<{ name: string; input: Record<string, unknown> }> = [];
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const domain: DomainPort = {
    resolveContext: async () => ({
      actor: { userId: "usr_test", authSubject: "subject" },
      requestId: "test",
    }),
    authorize: async () => undefined,
    transaction: async (_context, run) =>
      run({
        id: "test",
        authorize: async () => undefined,
        execute: async () => ({}) as never,
        query: async () => ({}) as never,
      }),
    execute: async (name, input) => {
      commands.push({ name, input: input as Record<string, unknown> });
      return (
        name === "v0.chat.send"
          ? { message_id: `msg_${commands.length}` }
          : { change_set_id: "chg_test" }
      ) as never;
    },
    query: async () => ({}) as never,
  };
  const app = await buildApp(readConfig({}), domain);
  try {
    const move = await app.inject({
      method: "POST",
      url: "/v1/trips/trp_test/moves",
      payload: {
        source_item_id: "itm_test",
        base_itinerary_version: 1,
        day_index: 2,
        starts_at: "2026-10-02T10:00:00+05:30",
        ends_at: "2026-10-02T11:00:00+05:30",
      },
    });
    assert.equal(move.statusCode, 201);
    assert.equal(commands[0].name, "v0.change.propose");
    assert.equal(commands[0].input.kind, "move");
    const chat = await app.inject({
      method: "POST",
      url: "/v1/trips/trp_test/chat",
      payload: { body: "@Trippy plan something" },
    });
    assert.equal(chat.statusCode, 201);
    assert.equal(
      commands.filter((entry) => entry.name === "v0.chat.send").length,
      2,
    );
    assert.match(String(commands.at(-1)?.input.body), /not configured/i);
    assert.equal(
      commands.some((entry) => entry.name === "decision.publish"),
      false,
    );
  } finally {
    await app.close();
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
