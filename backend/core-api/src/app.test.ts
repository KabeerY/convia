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
    assert.equal(trip.statusCode, 503);
    assert.equal(trip.json().error.code, "MODULE_UNAVAILABLE");
  } finally {
    await app.close();
  }
});
