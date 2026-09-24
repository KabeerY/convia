import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const connectionString =
  process.env.TEST_DATABASE_URL ?? process.env.CORE_DATABASE_URL;

test(
  "runtime role cannot read tables; admission, capacity, roles and privacy are enforced",
  {
    skip: !connectionString,
  },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      const runtime =
        (await client.query<{ current_user: string }>("SELECT current_user"))
          .rows[0].current_user === "convia_runtime";
      const city = runtime
        ? process.env.TEST_CITY_ID
        : (
            await client.query<{ city_id: string }>(
              "SELECT city_id FROM cities LIMIT 1",
            )
          ).rows[0].city_id;
      assert.ok(
        city,
        "TEST_CITY_ID must identify a seeded city when connecting as runtime",
      );
      await client.query("BEGIN");
      if (!runtime) await client.query("SET LOCAL ROLE convia_runtime");
      async function value<T>(sql: string, values: unknown[]): Promise<T> {
        return (await client.query<{ value: T }>(sql, values)).rows[0].value;
      }
      async function expectError(
        sql: string,
        values: unknown[],
        message: RegExp,
      ) {
        await client.query("SAVEPOINT expected_error");
        await assert.rejects(client.query(sql, values), message);
        await client.query("ROLLBACK TO SAVEPOINT expected_error");
        await client.query("RELEASE SAVEPOINT expected_error");
      }
      await expectError("SELECT * FROM users LIMIT 1", [], /permission denied/);
      const ids: string[] = [];
      for (const index of [0, 1, 2]) {
        const subject = randomUUID();
        ids.push(
          await value<string>("SELECT wm_bootstrap_user($1,$2,$3) AS value", [
            subject,
            `pr02-${subject}@example.test`,
            `Test ${index}`,
          ]),
        );
      }
      assert.equal(new Set(ids).size, 3);
      async function command<T>(actor: string, action: string, input: object) {
        return value<T>("SELECT wm_trip_command($1,$2,$3::jsonb) AS value", [
          actor,
          action,
          JSON.stringify(input),
        ]);
      }
      const created = await command<{ trip_id: string; itinerary_id: string }>(
        ids[0],
        "trip.create",
        {
          title: "Integration trip",
          destination_city_id: city,
          start_date: "2026-11-01",
          end_date: "2026-11-03",
          capacity: 2,
          admission_policy: "approval",
          visibility: "public",
        },
      );
      assert.ok(created.itinerary_id);
      await expectError(
        "SELECT wm_trip_query($1,'trip.read',$2)",
        [ids[1], created.trip_id],
        /MEMBERSHIP_REQUIRED/,
      );
      const requested = await command<{ request_id: string }>(
        ids[1],
        "admission.request",
        { trip_id: created.trip_id },
      );
      await expectError(
        "SELECT wm_trip_command($1,'admission.review',$2::jsonb)",
        [
          ids[1],
          JSON.stringify({
            trip_id: created.trip_id,
            request_id: requested.request_id,
            decision: "accepted",
          }),
        ],
        /MEMBERSHIP_REQUIRED/,
      );
      const reviewed = await command<{ state: string }>(
        ids[0],
        "admission.review",
        {
          trip_id: created.trip_id,
          request_id: requested.request_id,
          decision: "accepted",
        },
      );
      assert.equal(reviewed.state, "accepted");
      const third = await command<{ request_id: string }>(
        ids[2],
        "admission.request",
        { trip_id: created.trip_id },
      );
      await expectError(
        "SELECT wm_trip_command($1,'admission.review',$2::jsonb)",
        [
          ids[0],
          JSON.stringify({
            trip_id: created.trip_id,
            request_id: third.request_id,
            decision: "accepted",
          }),
        ],
        /TRIP_FULL/,
      );
      const members = await value<Array<{ user_id: string }>>(
        "SELECT wm_trip_query($1,'trip.members',$2) AS value",
        [ids[1], created.trip_id],
      );
      assert.equal(members.length, 2);
      await command(ids[0], "member.remove", {
        trip_id: created.trip_id,
        user_id: ids[1],
      });
      await expectError(
        "SELECT wm_trip_query($1,'trip.read',$2)",
        [ids[1], created.trip_id],
        /MEMBERSHIP_REQUIRED/,
      );
      await expectError(
        "SELECT wm_trip_command($1,'admission.request',$2::jsonb)",
        [ids[1], JSON.stringify({ trip_id: created.trip_id })],
        /REMOVED_MEMBER/,
      );
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  },
);
