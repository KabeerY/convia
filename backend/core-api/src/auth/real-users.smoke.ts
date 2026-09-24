import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { buildApp } from "../app.js";
import { readConfig } from "../config.js";
import { createDomain } from "../domain.js";

const config = readConfig();
const secret = process.env.SUPABASE_SECRET_KEY;
const accounts = [
  {
    email: process.env.PR02_TEST_EMAIL_A,
    password: process.env.PR02_TEST_PASSWORD_A,
    name: "PR02 Alice",
  },
  {
    email: process.env.PR02_TEST_EMAIL_B,
    password: process.env.PR02_TEST_PASSWORD_B,
    name: "PR02 Bob",
  },
].map((account) => {
  if (!account.email || !account.password)
    throw new Error("Two test-account email/password pairs are required");
  return { ...account, email: account.email, password: account.password };
});
if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY || !secret) {
  throw new Error(
    "Supabase server key and two test-account email/password pairs are required",
  );
}
const admin = createClient(config.SUPABASE_URL, secret, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const publicAuth = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
const domain = createDomain(config);
const app = await buildApp(config, domain);
try {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });
  if (listError) throw listError;
  for (const account of accounts) {
    const existing = listed.users.find((user) => user.email === account.email);
    if (!existing) {
      const { error } = await admin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.name, fixture: "pr02" },
      });
      if (error) throw error;
    }
  }
  const identities: Array<{ user_id: string; auth_subject: string }> = [];
  for (const account of accounts) {
    const { data, error } = await publicAuth.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    if (error || !data.session) throw error ?? new Error("No session returned");
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    identities.push(response.json());
    assert.equal(identities.at(-1)?.auth_subject, data.user.id);
  }
  assert.notEqual(identities[0].auth_subject, identities[1].auth_subject);
  assert.notEqual(identities[0].user_id, identities[1].user_id);
  if (!config.CORE_DATABASE_URL || !process.env.TEST_CITY_ID) {
    throw new Error(
      "CORE_DATABASE_URL and TEST_CITY_ID are required for private-access check",
    );
  }
  const client = new pg.Client({ connectionString: config.CORE_DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ value: { trip_id: string } }>(
      "SELECT wm_trip_command($1,'trip.create',$2::jsonb) AS value",
      [
        identities[0].user_id,
        JSON.stringify({
          title: "PR02 private Auth check",
          destination_city_id: process.env.TEST_CITY_ID,
          start_date: "2026-11-01",
          end_date: "2026-11-03",
          capacity: 2,
          admission_policy: "invite_only",
          visibility: "private",
        }),
      ],
    );
    const tripId = created.rows[0].value.trip_id;
    const ownerRead = await client.query(
      "SELECT wm_trip_query($1,'trip.read',$2)",
      [identities[0].user_id, tripId],
    );
    assert.equal(ownerRead.rowCount, 1);
    await client.query("SAVEPOINT denied_read");
    await assert.rejects(
      client.query("SELECT wm_trip_query($1,'trip.read',$2)", [
        identities[1].user_id,
        tripId,
      ]),
      /MEMBERSHIP_REQUIRED/,
    );
    await client.query("ROLLBACK TO SAVEPOINT denied_read");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
  console.log(
    "PASS: two real Supabase Auth users map to distinct canonical users through verified JWTs",
  );
  console.log(
    "PASS: the second real account cannot read the first account's private trip",
  );
  console.log(
    `Auth subjects: ${identities.map((identity) => identity.auth_subject).join(", ")}`,
  );
  console.log(
    `Canonical users: ${identities.map((identity) => identity.user_id).join(", ")}`,
  );
} finally {
  await app.close();
  await domain.close();
}
