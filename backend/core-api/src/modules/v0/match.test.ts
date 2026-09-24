import assert from "node:assert/strict";
import test from "node:test";
import { groupGenome, matchProfile } from "./match.js";

test("matching does not invent evidence for an empty Passport", () => {
  assert.deepEqual(matchProfile({}, { interests: ["Nature"] }), {
    match_score: null,
    coverage: 0,
    match_reasons: [],
  });
});
test("matching explains shared interests after filtering", () => {
  const result = matchProfile(
    { interests: ["Nature", "Food"], pace: "balanced", budget_band: "mid" },
    {
      interests: ["Nature", "Adventure"],
      pace: "balanced",
      budget_band: "mid",
    },
  );
  assert.equal(result.coverage, 1);
  assert.ok(result.match_score && result.match_score > 0.6);
  assert.ok(result.match_reasons.some((reason) => reason.includes("nature")));
});
test("genome preserves unknown member preferences", () => {
  const result = groupGenome({
    profile: { interests: ["Nature"] },
    member_passports: [{ interests: ["Nature"], pace: "active" }],
    member_count: 3,
  });
  assert.ok(result.shared_anchors.includes("Nature"));
  assert.ok(result.unknown.includes("Some member Passports"));
});
