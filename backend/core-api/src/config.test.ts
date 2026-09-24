import assert from "node:assert/strict";
import test from "node:test";
import { readConfig, readiness } from "./config.js";

test("Core advertises missing integration instead of false readiness", () => {
  const config = readConfig({});
  assert.equal(config.PORT, 4000);
  assert.equal(readiness(config).ready, false);
  assert.ok(readiness(config).missing.includes("CORE_DATABASE_URL"));
});
