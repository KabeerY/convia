import test from "node:test";
import assert from "node:assert/strict";
import { genderRepresentationLabel, pendingLabel } from "./representation.js";

test("formats women count with percentage", () => {
  assert.equal(genderRepresentationLabel({ women_public_count: 2, active_traveller_count: 4, women_public_percentage: 50 }), "2 of 4 travellers publicly self-describe as women — 50%");
});

test("handles zero travellers", () => {
  assert.equal(genderRepresentationLabel({ women_public_count: 0, active_traveller_count: 0, women_public_percentage: null }), "Women — not enough traveller data yet");
});

test("handles missing representation", () => {
  assert.equal(genderRepresentationLabel(null), null);
});

test("pending label", () => {
  assert.equal(pendingLabel({ pending_request_count: 2 }), "2 pending requests");
  assert.equal(pendingLabel({ pending_request_count: 1 }), "1 pending request");
  assert.equal(pendingLabel({ pending_request_count: 0 }), null);
});
