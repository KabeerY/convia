import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../app.js";
import { readConfig } from "../config.js";
import type { DomainPort } from "../module-contract.js";

// Use a disposable database. This test commits data to exercise independent sessions.
const connectionString = process.env.TEST_DATABASE_URL;

test(
  "simultaneous decisive retries commit one locked itinerary version",
  {
    skip: !connectionString,
  },
  async () => {
    const admin = new pg.Client({ connectionString });
    const first = new pg.Client({ connectionString });
    const second = new pg.Client({ connectionString });
    const retry = new pg.Client({ connectionString });
    await Promise.all([
      admin.connect(),
      first.connect(),
      second.connect(),
      retry.connect(),
    ]);
    try {
      const city = (
        await admin.query<{ city_id: string }>(
          "SELECT city_id FROM cities WHERE status='active' LIMIT 1",
        )
      ).rows[0]?.city_id;
      assert.ok(city, "seed canonical cities before running this test");
      const subjects = [randomUUID(), randomUUID(), randomUUID()];
      const users: string[] = [];
      for (const [index, subject] of subjects.entries()) {
        users.push(
          (
            await admin.query<{ user_id: string }>(
              "SELECT wm_bootstrap_user($1,$2,$3) AS user_id",
              [
                subject,
                `decision-${subject}@example.test`,
                `Decision ${index}`,
              ],
            )
          ).rows[0].user_id,
        );
      }
      await Promise.all(
        [first, second, retry].map((client) =>
          client.query("SET ROLE convia_runtime"),
        ),
      );
      async function command<T>(
        client: pg.Client,
        actor: string,
        action: string,
        input: object,
      ) {
        return (
          await client.query<{ value: T }>(
            "SELECT wm_decision_command($1,$2,$3::jsonb) AS value",
            [actor, action, JSON.stringify(input)],
          )
        ).rows[0].value;
      }
      async function tripCommand<T>(
        client: pg.Client,
        actor: string,
        action: string,
        input: object,
      ) {
        return (
          await client.query<{ value: T }>(
            "SELECT wm_trip_command($1,$2,$3::jsonb) AS value",
            [actor, action, JSON.stringify(input)],
          )
        ).rows[0].value;
      }
      const date = new Date(Date.now() + 30 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const created = await tripCommand<{ trip_id: string }>(
        first,
        users[0],
        "trip.create",
        {
          title: "Decision test trip",
          destination_city_id: city,
          start_date: date,
          end_date: date,
          capacity: 2,
          visibility: "public",
          admission_policy: "open",
          timezone: "UTC",
        },
      );
      await tripCommand(second, users[1], "admission.request", {
        trip_id: created.trip_id,
      });
      const published = await command<{
        change_set_id: string;
        revision: number;
        threshold: number;
        yes_count: number;
        actor_ballot: string | null;
      }>(first, users[0], "decision.publish", {
        trip_id: created.trip_id,
        base_itinerary_version: 1,
        title: "Add a walk",
        operations: [
          {
            action: "add",
            new_item: {
              title: "Morning walk",
              item_type: "poi",
              day_index: 1,
              starts_at: `${date}T10:00:00Z`,
              ends_at: `${date}T11:00:00Z`,
            },
            cost_basis: "unknown",
          },
        ],
      });
      assert.equal(published.revision, 0);
      assert.equal(published.threshold, 2);
      assert.equal(published.yes_count, 0);
      assert.equal(published.actor_ballot, null);
      const competing = await command<{ change_set_id: string }>(
        first,
        users[0],
        "decision.publish",
        {
          trip_id: created.trip_id,
          base_itinerary_version: 1,
          title: "Competing walk",
          operations: [
            {
              action: "add",
              new_item: {
                title: "Second walk",
                item_type: "poi",
                day_index: 1,
                starts_at: `${date}T12:00:00Z`,
                ends_at: `${date}T13:00:00Z`,
              },
              cost_basis: "unknown",
            },
          ],
        },
      );
      const one = await command<{ state: string; revision: number }>(
        first,
        users[0],
        "decision.vote",
        {
          change_set_id: published.change_set_id,
          vote: "yes",
          expected_revision: 0,
        },
      );
      assert.equal(one.state, "open");
      assert.equal(one.revision, 1);
      await assert.rejects(
        command(second, users[1], "decision.vote", {
          change_set_id: published.change_set_id,
          vote: "yes",
          expected_revision: 0,
        }),
        /REVISION_CONFLICT/,
      );
      const decisive = {
        change_set_id: published.change_set_id,
        vote: "yes",
        expected_revision: 1,
        idempotency_key: randomUUID(),
      };
      const [a, b] = await Promise.all([
        command<{
          state: string;
          revision: number;
          committed_itinerary_version: number;
        }>(second, users[1], "decision.vote", decisive),
        command<{
          state: string;
          revision: number;
          committed_itinerary_version: number;
        }>(retry, users[1], "decision.vote", decisive),
      ]);
      assert.deepEqual(a, b);
      assert.equal(a.state, "committed");
      assert.equal(a.revision, 2);
      assert.equal(a.committed_itinerary_version, 2);
      const commit = await admin.query<{
        version: number;
        commits: string;
        locks: string;
      }>(
        `
      SELECT i.version,
        (SELECT count(*) FROM wm_commit_records WHERE change_set_id=$2)::text AS commits,
        (SELECT count(*) FROM wm_item_state WHERE latest_change_set_id=$2 AND decision_locked)::text AS locks
      FROM itineraries i WHERE i.trip_id=$1 AND i.is_active`,
        [created.trip_id, published.change_set_id],
      );
      assert.equal(commit.rows[0].version, 2);
      assert.equal(commit.rows[0].commits, "1");
      assert.equal(commit.rows[0].locks, "1");
      await command(first, users[0], "decision.vote", {
        change_set_id: competing.change_set_id,
        vote: "yes",
        expected_revision: 0,
      });
      const stale = await command<{ state: string }>(
        second,
        users[1],
        "decision.vote",
        {
          change_set_id: competing.change_set_id,
          vote: "yes",
          expected_revision: 1,
        },
      );
      assert.equal(stale.state, "stale");
      const unchanged = await admin.query<{ version: number }>(
        "SELECT version FROM itineraries WHERE trip_id=$1 AND is_active",
        [created.trip_id],
      );
      assert.equal(unchanged.rows[0].version, 2);
      const itinerary = (
        await first.query<{
          value: {
            items: Array<{
              logical_item_id: string;
              decision_locked: boolean;
              locked: boolean;
            }>;
          };
        }>("SELECT wm_decision_query($1,'itinerary.read',$2) AS value", [
          users[0],
          created.trip_id,
        ])
      ).rows[0].value;
      assert.equal(itinerary.items.length, 1);
      assert.equal(itinerary.items[0].decision_locked, true);
      assert.equal(itinerary.items[0].locked, false);
      const item = (
        await first.query<{ value: { decision_locked: boolean } }>(
          "SELECT wm_decision_query($1,'item.read',$2) AS value",
          [users[0], itinerary.items[0].logical_item_id],
        )
      ).rows[0].value;
      assert.equal(item.decision_locked, true);
      const unavailable = async (): Promise<never> => {
        throw new Error("not used");
      };
      const domain: DomainPort = {
        resolveContext: async (request) => ({
          actor: { userId: users[0], authSubject: subjects[0] },
          requestId: request.id,
        }),
        query: async (name, context, resourceId) => {
          const result = await first.query<{ value: unknown }>(
            "SELECT wm_decision_query($1,$2,$3) AS value",
            [context.actor.userId, name, resourceId],
          );
          return result.rows[0].value as never;
        },
        authorize: unavailable,
        execute: unavailable,
        transaction: unavailable,
      };
      const app = await buildApp(readConfig({}), domain);
      try {
        const edit = await app.inject({
          method: "PATCH",
          url: `/v1/itinerary-items/${itinerary.items[0].logical_item_id}`,
          payload: { title: "Bypass" },
        });
        assert.equal(edit.statusCode, 409);
        assert.equal(edit.json().error.code, "DECISION_LOCKED");
      } finally {
        await app.close();
      }
      await assert.rejects(
        first.query(
          "UPDATE itinerary_items SET title='Bypass' WHERE itinerary_id=(SELECT itinerary_id FROM itineraries WHERE trip_id=$1 AND is_active)",
          [created.trip_id],
        ),
        /permission denied/,
      );
      await assert.rejects(
        command(first, users[2], "decision.vote", {
          ...decisive,
          idempotency_key: randomUUID(),
        }),
        /MEMBERSHIP_REQUIRED/,
      );
      await assert.rejects(
        first.query("SELECT wm_decision_query($1,'decision.read',$2)", [
          users[2],
          published.change_set_id,
        ]),
        /MEMBERSHIP_REQUIRED/,
      );
    } finally {
      await Promise.all([admin.end(), first.end(), second.end(), retry.end()]);
    }
  },
);
