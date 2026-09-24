import test from "node:test";
import assert from "node:assert/strict";
import { groupPlanItems, itemPlanLabel } from "./itinerary.js";

test("current plan groups one-based days and excludes superseded revisions", () => {
  const days = groupPlanItems([
    { item_id: "late", day_index: 2, sort_order: 1, status: "confirmed" },
    { item_id: "old", day_index: 1, status: "replaced" },
    { item_id: "first", day_index: 1, sort_order: 0, status: "confirmed" },
    { item_id: "removed", day_index: 2, status: "removed" },
  ]);
  assert.deepEqual(days.map((day) => [day.dayIndex, day.items.map((item) => item.item_id)]), [[1, ["first"]], [2, ["late"]]]);
});

test("optimizer lock is not mislabeled as a group decision lock", () => {
  assert.equal(itemPlanLabel({ locked: true, decision_locked: false }), "Fixed booking");
  assert.equal(itemPlanLabel({ locked: false, decision_locked: true }), "Group-approved · locked");
});
