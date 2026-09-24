import test from "node:test";
import assert from "node:assert/strict";
import {
  localParts,
  zonedInstant,
  snapMinutes,
  layoutEvents,
  branchOrder,
  overlaps,
} from "./calendar.js";
test("destination time round-trips independently from the browser timezone", () => {
  assert.equal(
    zonedInstant("2026-11-01T09:15", "Asia/Kolkata"),
    "2026-11-01T03:45:00.000Z",
  );
  assert.equal(
    localParts("2026-11-01T03:45:00Z", "Asia/Kolkata").input,
    "2026-11-01T09:15",
  );
  assert.equal(
    zonedInstant("2026-09-01T10:00", "America/New_York"),
    "2026-09-01T14:00:00.000Z",
  );
  assert.throws(
    () => zonedInstant("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
});
test("touch placement and desktop drops snap to quarter-hour slots", () => {
  assert.equal(snapMinutes(546), 540);
  assert.equal(snapMinutes(548), 555);
  assert.equal(snapMinutes(1445), 1425);
});
test("overlapping cards get distinct lanes and touching cards share a lane", () => {
  const events = layoutEvents([
    { id: "a", top: 540, bottom: 600 },
    { id: "b", top: 555, bottom: 585 },
    { id: "c", top: 600, bottom: 660 },
  ]);
  assert.equal(events[0].laneCount, 2);
  assert.notEqual(events[0].lane, events[1].lane);
  assert.equal(events[2].laneCount, 1);
  assert.equal(
    overlaps(
      { starts_at: "2026-11-01T09:00Z", ends_at: "2026-11-01T10:00Z" },
      { starts_at: "2026-11-01T10:00Z", ends_at: "2026-11-01T11:00Z" },
    ),
    false,
  );
});
test("nested branches are ordered next to their parent", () => {
  assert.deepEqual(
    branchOrder([
      { branch_id: "b", parent_branch_id: "a" },
      { branch_id: "c", parent_branch_id: null },
      { branch_id: "a", parent_branch_id: null },
    ]).map((b) => b.branch_id),
    ["c", "a", "b"],
  );
});
