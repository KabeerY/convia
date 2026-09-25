import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

// All fixtures are rolled back, including when explicitly run against the configured database.
const connectionString =
  process.env.TEST_DATABASE_URL ||
  (process.env.RUN_CALENDAR_DB_TEST === "1"
    ? process.env.CORE_DATABASE_URL
    : undefined);
test(
  "calendar paths enforce scopes, depth, attendance, voting and stale revisions",
  { skip: !connectionString },
  async () => {
    const db = new pg.Client({ connectionString });
    await db.connect();
    try {
      await db.query("BEGIN");
      const users: string[] = [];
      for (let i = 0; i < 3; i++) {
        const id = randomUUID();
        users.push(
          (
            await db.query("SELECT wm_bootstrap_user($1,$2,$3) id", [
              id,
              `calendar-${id}@example.test`,
              `Calendar ${i}`,
            ])
          ).rows[0].id,
        );
      }
      const city = "cty_9327d518";

      const call = async (
        fn: string,
        actor: string,
        action: string,
        input: object,
      ) =>
        (
          await db.query(`SELECT ${fn}($1,$2,$3::jsonb) value`, [
            actor,
            action,
            JSON.stringify(input),
          ])
        ).rows[0].value;
      const trip = await call("wm_trip_command", users[0], "trip.create", {
        title: "Calendar rollback test",
        destination_city_id: city,
        start_date: "2026-11-01",
        end_date: "2026-11-03",
        capacity: 8,
        visibility: "public",
        admission_policy: "open",
        timezone: "UTC",
      });
      const tid = trip.trip_id;
      const command = async (actor: string, input: object) =>
        (
          await db.query("SELECT wm_calendar_command($1,$2::jsonb) value", [
            actor,
            JSON.stringify({ trip_id: tid, ...input }),
          ])
        ).rows[0].value;
      const read = async (actor = users[0]) =>
        (await db.query("SELECT wm_calendar_read($1,$2) value", [actor, tid]))
          .rows[0].value;
      async function fails(actor: string, input: object, pattern: RegExp) {
        await db.query("SAVEPOINT expected_failure");
        await assert.rejects(command(actor, input), pattern);
        await db.query("ROLLBACK TO SAVEPOINT expected_failure");
      }
      const activity = {
        title: "Breakfast",
        item_type: "meal",
        starts_at: "2026-11-01T08:00:00Z",
        ends_at: "2026-11-01T09:00:00Z",
        description: "Meet here",
        location: "Town",
        coordinates: { lat: 32.24, lng: 77.18 },
      };
      const add = await command(users[0], {
        action: "change",
        branch_id: null,
        item_id: null,
        kind: "add",
        expected_revision: 1,
        activity,
      });
      await command(users[0], {
        action: "vote",
        proposal_id: add.proposal_id,
        vote: "yes",
        expected_revision: 0,
      });
      let snapshot = await read();
      assert.equal(snapshot.activities.length, 1);
      assert.equal(snapshot.activities[0].location, "Town");
      assert.deepEqual(snapshot.activities[0].coordinates, {
        lat: 32.24,
        lng: 77.18,
      });
      assert.equal(snapshot.activities[0].description, "Meet here");
      const source = snapshot.activities[0].item_id;
      const branchInput = {
        action: "branch.create",
        title: "Alternative",
        source_item_id: source,
        parent_branch_id: null,
        starts_at: activity.starts_at,
        rejoin_at: "2026-11-02T18:00:00Z",
        rejoin_item_id: null,
        rejoin_note: "Town square",
      };
      const branch = await command(users[0], branchInput);
      snapshot = await read();
      assert.equal(snapshot.branches[0].depth, 1);
      assert.equal(snapshot.recommendations.length, 3);
      const solo = await command(users[0], {
        action: "change",
        branch_id: branch.branch_id,
        item_id: null,
        kind: "add",
        expected_revision: 0,
        activity: {
          ...activity,
          title: "Museum",
          starts_at: "2026-11-01T09:00:00Z",
          ends_at: "2026-11-01T11:00:00Z",
        },
      });
      assert.equal(solo.status, "committed");
      await fails(
        users[2],
        { action: "branch.join", branch_id: branch.branch_id, joining: true },
        /MEMBERSHIP_REQUIRED/,
      );
      await call("wm_trip_command", users[1], "admission.request", {
        trip_id: tid,
      });
      await fails(
        users[1],
        {
          action: "change",
          branch_id: branch.branch_id,
          item_id: solo.item_id,
          kind: "remove",
          expected_revision: 1,
        },
        /BRANCH_MEMBERSHIP_REQUIRED/,
      );
      await command(users[1], {
        action: "branch.join",
        branch_id: branch.branch_id,
        joining: true,
      });
      snapshot = await read();
      assert.equal(snapshot.branches[0].revision, 2);
      assert.equal(
        snapshot.activities.find(
          (a: { item_id: string }) => a.item_id === solo.item_id,
        ).attendee_ids.length,
        2,
      );
      const change = await command(users[0], {
        action: "change",
        branch_id: branch.branch_id,
        item_id: solo.item_id,
        kind: "edit",
        expected_revision: 2,
        activity: {
          ...activity,
          title: "Museum moved",
          starts_at: "2026-11-01T10:00:00Z",
          ends_at: "2026-11-01T12:00:00Z",
        },
      });
      assert.equal(change.status, "open");
      await command(users[0], {
        action: "vote",
        proposal_id: change.proposal_id,
        vote: "yes",
        expected_revision: 0,
      });
      await fails(
        users[1],
        {
          action: "vote",
          proposal_id: change.proposal_id,
          vote: "yes",
          expected_revision: 0,
        },
        /REVISION_CONFLICT/,
      );
      await command(users[1], {
        action: "vote",
        proposal_id: change.proposal_id,
        vote: "yes",
        expected_revision: 1,
      });
      snapshot = await read();
      assert.equal(
        snapshot.activities.find(
          (a: { item_id: string }) => a.item_id === solo.item_id,
        ).title,
        "Museum moved",
      );
      await fails(
        users[0],
        {
          action: "change",
          branch_id: branch.branch_id,
          item_id: null,
          kind: "add",
          expected_revision: 3,
          activity: { ...activity, ends_at: "2026-11-03T20:00:00Z" },
        },
        /OUTSIDE_BRANCH_WINDOW/,
      );
      const question = await command(users[1], {
        action: "question",
        item_id: solo.item_id,
        body: "Check weather?",
      });
      await command(users[1], {
        action: "reply",
        proposal_id: question.proposal_id,
        body: "Let's check before leaving.",
      });
      await command(users[1], {
        action: "vote",
        proposal_id: question.proposal_id,
        vote: "no",
        expected_revision: 0,
      });
      snapshot = await read();
      assert.equal(
        snapshot.proposals.find(
          (q: { proposal_id: string }) =>
            q.proposal_id === question.proposal_id,
        ).replies.length,
        1,
      );
      assert.ok(
        snapshot.activities
          .find((a: { item_id: string }) => a.item_id === solo.item_id)
          .attendee_ids.includes(users[1]),
        "question votes must not change attendance",
      );
      let parent = branch.branch_id,
        parentSource = solo.item_id;
      for (let depth = 2; depth <= 5; depth++) {
        const child = await command(users[0], {
          ...branchInput,
          parent_branch_id: parent,
          source_item_id: parentSource,
          starts_at: "2026-11-01T10:00:00Z",
          title: `Level ${depth}`,
        });
        const nested = await command(users[0], {
          action: "change",
          branch_id: child.branch_id,
          item_id: null,
          kind: "add",
          expected_revision: 0,
          activity: {
            ...activity,
            starts_at: "2026-11-01T10:00:00Z",
            ends_at: "2026-11-01T11:00:00Z",
          },
        });
        parent = child.branch_id;
        parentSource = nested.item_id;
      }
      await fails(
        users[0],
        {
          ...branchInput,
          parent_branch_id: parent,
          source_item_id: parentSource,
          starts_at: "2026-11-01T10:00:00Z",
        },
        /BRANCH_DEPTH_LIMIT/,
      );
      const editMain = await command(users[0], {
        action: "change",
        branch_id: null,
        item_id: source,
        kind: "edit",
        expected_revision: 2,
        activity: { ...activity, starts_at: "2026-11-01T08:15:00Z" },
      });
      await command(users[0], {
        action: "vote",
        proposal_id: editMain.proposal_id,
        vote: "yes",
        expected_revision: 0,
      });
      await command(users[1], {
        action: "vote",
        proposal_id: editMain.proposal_id,
        vote: "yes",
        expected_revision: 1,
      });
      snapshot = await read();
      assert.equal(
        snapshot.branches.find(
          (b: { branch_id: string }) => b.branch_id === branch.branch_id,
        ).needs_review,
        true,
      );
      const pending = await command(users[0], {
        action: "change",
        branch_id: branch.branch_id,
        item_id: solo.item_id,
        kind: "remove",
        expected_revision: snapshot.branches.find(
          (b: { branch_id: string }) => b.branch_id === branch.branch_id,
        ).revision,
      });
      await command(users[1], {
        action: "branch.join",
        branch_id: branch.branch_id,
        joining: false,
      });
      await command(users[0], {
        action: "vote",
        proposal_id: pending.proposal_id,
        vote: "yes",
        expected_revision: 0,
      });
      snapshot = await read();
      assert.equal(
        snapshot.proposals.find(
          (q: { proposal_id: string }) => q.proposal_id === pending.proposal_id,
        ).status,
        "stale",
      );
      // Cancellation includes descendants and still needs organizer approval.
      const currentBranch = snapshot.branches.find(
        (b: { branch_id: string }) => b.branch_id === branch.branch_id,
      );
      const cancel = await command(users[0], {
        action: "change",
        branch_id: branch.branch_id,
        item_id: null,
        kind: "cancel",
        expected_revision: currentBranch.revision,
      });
      await command(users[0], {
        action: "vote",
        proposal_id: cancel.proposal_id,
        vote: "yes",
        expected_revision: 0,
      });
      snapshot = await read();
      assert.equal(
        snapshot.branches.length,
        0,
        "cancelling a path cancels its full subtree",
      );
      assert.equal(
        snapshot.activities.length,
        1,
        "main-plan activities survive cancellation",
      );
      const removeMain = await command(users[0], {
        action: "change",
        branch_id: null,
        item_id: source,
        kind: "remove",
        expected_revision: snapshot.version,
      });
      await command(users[0], {
        action: "vote",
        proposal_id: removeMain.proposal_id,
        vote: "yes",
        expected_revision: 0,
      });
      await command(users[1], {
        action: "vote",
        proposal_id: removeMain.proposal_id,
        vote: "yes",
        expected_revision: 1,
      });
      snapshot = await read();
      assert.equal(snapshot.activities.length, 0);
      await db.query("SAVEPOINT forbidden_table_read");
      await assert.rejects(
        db.query("SELECT * FROM wm_calendar_branches"),
        /permission denied/,
      );
      await db.query("ROLLBACK TO SAVEPOINT forbidden_table_read");
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  },
);
