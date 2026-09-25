import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import type { DomainPort } from "./module-contract.js";

test("Core skeleton reports honest process and API status", async () => {
  const absent = async () => {
    throw new Error("unavailable");
  };
  const domain: DomainPort = {
    resolveContext: absent,
    authorize: absent,
    transaction: absent,
    execute: absent,
    query: absent,
  };
  const app = await buildApp(readConfig({}), domain);
  try {
    const health = await app.inject("/health");
    assert.equal(health.statusCode, 200);
    const ready = await app.inject("/ready");
    assert.equal(ready.statusCode, 503);
    const trip = await app.inject("/v1/trips/demo");
    // Trips routes are implemented, so this must not report MODULE_UNAVAILABLE
    // (the stub domain fails the request, but the route exists).
    assert.notEqual(trip.json().error?.code, "MODULE_UNAVAILABLE");
    const chat = await app.inject("/v1/conversations/demo");
    assert.equal(chat.statusCode, 503);
    assert.equal(chat.json().error.code, "MODULE_UNAVAILABLE");
  } finally {
    await app.close();
  }
});

test("currency conversion uses the dated reference rate and decimal arithmetic", async () => {
  const absent = async () => {
    throw new Error("not used");
  };
  const domain: DomainPort = {
    resolveContext: async () => ({
      actor: { userId: "traveller", authSubject: "test" },
      requestId: "fx-test",
    }),
    authorize: absent,
    transaction: absent,
    execute: absent,
    query: absent,
  } as DomainPort;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ date: "2026-09-24", rate: 26.086 }), {
      status: 200,
    });
  const app = await buildApp(readConfig({}), domain);
  try {
    const result = await app.inject(
      "/v1/fx/convert?from=AED&to=INR&amount=125.50",
    );
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().converted, "3273.79");
    assert.equal(result.json().rate_date, "2026-09-24");
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});
