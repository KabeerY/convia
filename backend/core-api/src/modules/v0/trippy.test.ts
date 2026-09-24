import assert from "node:assert/strict";
import test from "node:test";
import { askTrippy, trippyConfigured } from "./trippy.js";

test("a template Gemini key is treated as unconfigured, not sent to the provider", async () => {
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "replace-with-server-only-key";
  try {
    assert.equal(trippyConfigured(), false);
    await assert.rejects(
      askTrippy("suggest a walk", {}),
      /TRIPPY_NOT_CONFIGURED/,
    );
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});
