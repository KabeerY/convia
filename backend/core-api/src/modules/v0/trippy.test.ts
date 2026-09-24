import assert from "node:assert/strict";
import test from "node:test";
import { askTrippy, askTrippyService, trippyConfigured, trippyServiceConfigured } from "./trippy.js";

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

test("Trippy service receives only the latest chat context and trusted scope", async () => {
  const priorUrl = process.env.TRIPPY_SERVICE_URL;
  const priorToken = process.env.TRIPPY_SERVICE_TOKEN;
  const priorFetch = globalThis.fetch;
  process.env.TRIPPY_SERVICE_URL = "https://trippy.example.test";
  process.env.TRIPPY_SERVICE_TOKEN = "test-service-token-with-enough-length";
  let payload: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url, options) => {
    payload = JSON.parse(String(options?.body));
    return new Response(JSON.stringify({ answer: "36 minutes." }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(trippyServiceConfigured(), true);
    const context = Array.from({ length: 20 }, (_, index) => ({
      role: "user" as const,
      content: `message ${index}`,
    }));
    assert.equal(await askTrippyService("How long?", context, "trusted-trip", "trusted-user"), "36 minutes.");
    assert.equal(payload?.trip_id, "trusted-trip");
    assert.equal(payload?.user_id, "trusted-user");
    assert.equal((payload?.context as Array<{ content: string }>).length, 15);
    assert.equal((payload?.context as Array<{ content: string }>)[0].content, "message 5");
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.TRIPPY_SERVICE_URL;
    else process.env.TRIPPY_SERVICE_URL = priorUrl;
    if (priorToken === undefined) delete process.env.TRIPPY_SERVICE_TOKEN;
    else process.env.TRIPPY_SERVICE_TOKEN = priorToken;
  }
});
