import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import pg from "pg";
import { to as copyTo } from "pg-copy-streams";
import { dataRoot } from "./paths.js";

const execFileAsync = promisify(execFile);
const tables = [
  "currencies",
  "languages",
  "countries",
  "cities",
  "tour_guides",
  "users",
  "trips",
  "user_interactions",
  "user_preferences",
  "itineraries",
  "itinerary_items",
  "proposals",
  "trip_members",
  "votes",
] as const;

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required");
  const dir = await mkdtemp(resolve(tmpdir(), "convia-conformance-"));
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    for (const [index, table] of tables.entries()) {
      const filename = `${String(index + 1).padStart(2, "0")}_${table}.csv`;
      const columns = await client.query<{
        column_name: string;
        data_type: string;
      }>(
        `SELECT column_name,data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [table],
      );
      const projection = columns.rows
        .map(({ column_name, data_type }) => {
          const quoted = `"${column_name.replaceAll('"', '""')}"`;
          return data_type === "timestamp with time zone"
            ? `to_char(${quoted} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' AS ${quoted}`
            : quoted;
        })
        .join(",");
      await pipeline(
        client.query(
          copyTo(
            `COPY (SELECT ${projection} FROM public.${table}) TO STDOUT WITH (FORMAT csv, HEADER true)`,
          ),
        ),
        createWriteStream(resolve(dir, filename)),
      );
      const actual = await client.query<{ count: string }>(
        `SELECT count(*) FROM public.${table}`,
      );
      const ledger = await client.query<{ rows_loaded: number }>(
        "SELECT rows_loaded FROM convia_seed_ledger WHERE source=$1",
        [filename],
      );
      if (
        !ledger.rows.length ||
        Number(actual.rows[0].count) < ledger.rows[0].rows_loaded
      ) {
        throw new Error(`Canonical count below seed ledger for ${table}`);
      }
      console.log(
        `${table}: ${actual.rows[0].count} rows (${ledger.rows[0].rows_loaded} imported)`,
      );
    }
    await client.query("COMMIT");
    const { stdout, stderr } = await execFileAsync("python3", [
      resolve(dataRoot, "tools/validate_conformance.py"),
      dir,
    ]);
    process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}

await main();
