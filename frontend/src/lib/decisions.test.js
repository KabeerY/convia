import test from "node:test";
import assert from "node:assert/strict";
import { ballotRequest, decisionState, decisionThreshold } from "./decisions.js";

test("ballot request uses the checked-in vote and revision fields", () => {
  assert.deepEqual(ballotRequest({ revision: 3 }, "yes"), { vote: "yes", expected_revision: 3 });
});

test("ballot request refuses missing server revisions", () => {
  assert.throws(() => ballotRequest({}, "no"), /server revision/);
  assert.throws(() => ballotRequest({ revision: 0 }, "abstain"), /Choose yes or no/);
});

test("decision fields accept the published summary names", () => {
  assert.equal(decisionState({ state: "committed" }), "committed");
  assert.equal(decisionThreshold({ threshold: 2 }), 2);
  assert.equal(decisionState({ status: "open" }), "open");
});
