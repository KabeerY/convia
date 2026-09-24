import test from "node:test";
import assert from "node:assert/strict";
import { parseTravelContext, travelContextPrompt } from "./contextImport.js";

test("AI handoff prompt asks for travel-only evidence and unknowns", () => {
  assert.match(travelContextPrompt, /clearly expressed/);
  assert.match(travelContextPrompt, /Do not include my name/);
});

test("parser accepts fenced JSON and ignores unsupported extra data", () => {
  const result = parseTravelContext('```json\n{"interests":["food","Nature","unknown"],"pace":"BALANCED","budget_band":null,"name":"ignore this"}\n```');
  assert.deepEqual(result, { interests: ["Food", "Nature"], pace: "balanced", budget_band: "" });
});

test("parser rejects malformed or preference-free answers", () => {
  assert.throws(() => parseTravelContext("Here are your interests: adventure"), /valid JSON/);
  assert.throws(() => parseTravelContext('{"interests":[],"pace":null,"budget_band":null}'), /No supported travel preferences/);
});
