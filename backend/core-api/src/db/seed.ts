import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { dataRoot } from "./paths.js";

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
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('convia_canonical_seed'))",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS public.convia_seed_ledger (
      source text PRIMARY KEY, sha256 text NOT NULL, rows_loaded integer NOT NULL,
      loaded_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(
      "ALTER TABLE public.convia_seed_ledger ENABLE ROW LEVEL SECURITY",
    );
    await client.query("REVOKE ALL ON public.convia_seed_ledger FROM PUBLIC");
    for (const [index, table] of tables.entries()) {
      const filename = `${String(index + 1).padStart(2, "0")}_${table}.csv`;
      const path = resolve(dataRoot, "seed/canonical/csv", filename);
      const contents = await readFile(path);
      const sha256 = createHash("sha256").update(contents).digest("hex");
      const applied = await client.query<{ sha256: string }>(
        "SELECT sha256 FROM public.convia_seed_ledger WHERE source = $1",
        [filename],
      );
      if (applied.rows.length) {
        if (applied.rows[0].sha256 !== sha256)
          throw new Error(`Canonical seed changed: ${filename}`);
        console.log(`Already loaded: ${filename}`);
        continue;
      }
      // Names come only from the fixed table list above, never external input.
      await pipeline(
        createReadStream(path),
        client.query(
          copyFrom(
            `COPY public.${table} FROM STDIN WITH (FORMAT csv, HEADER true)`,
          ),
        ),
      );
      const rowsLoaded =
        contents.toString("utf8").trimEnd().split("\n").length - 1;
      await client.query(
        "INSERT INTO public.convia_seed_ledger(source, sha256, rows_loaded) VALUES($1,$2,$3)",
        [filename, sha256, rowsLoaded],
      );
      console.log(`Loaded ${table}: ${rowsLoaded}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
