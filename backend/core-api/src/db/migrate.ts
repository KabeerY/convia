import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { dataRoot } from "./paths.js";

const migrations = [
  { name: "0001_canonical", path: resolve(dataRoot, "schema.sql") },
  {
    name: "0002_extensions",
    path: resolve(dataRoot, "migrations/0002_extensions.sql"),
  },
  {
    name: "0003_commands",
    path: resolve(dataRoot, "migrations/0003_commands.sql"),
  },
  {
    name: "0004_v0_decisions",
    path: resolve(dataRoot, "migrations/0004_v0_decisions.sql"),
  },
  {
    name: "0005_v0_pgcrypto_path",
    path: resolve(dataRoot, "migrations/0005_v0_pgcrypto_path.sql"),
  },
  {
    name: "0006_v0_extensions_access",
    path: resolve(dataRoot, "migrations/0006_v0_extensions_access.sql"),
  },
  {
    name: "0007_live_trip_features",
    path: resolve(dataRoot, "migrations/0007_live_trip_features.sql"),
  },
  {
    name: "0008_calendar_branches",
    path: resolve(dataRoot, "migrations/0008_calendar_branches.sql"),
  },
  {
    name: "0009_calendar_integrity",
    path: resolve(dataRoot, "migrations/0009_calendar_integrity.sql"),
  },
  {
    name: "0010_calendar_snapshot",
    path: resolve(dataRoot, "migrations/0010_calendar_snapshot.sql"),
  },
  {
    name: "0011_calendar_cancellation",
    path: resolve(dataRoot, "migrations/0011_calendar_cancellation.sql"),
  },
  {
    name: "0012_media_faces",
    path: resolve(dataRoot, "migrations/0012_media_faces.sql"),
  },
  {
    name: "0013_media_ingest",
    path: resolve(dataRoot, "migrations/0013_media_ingest.sql"),
  },
  {
    name: "0014_media_claim_uploader",
    path: resolve(dataRoot, "migrations/0014_media_claim_uploader.sql"),
  },
  {
    name: "0015_media_object",
    path: resolve(dataRoot, "migrations/0015_media_object.sql"),
  },
  {
    name: "0016_media_claim_reclaim",
    path: resolve(dataRoot, "migrations/0016_media_claim_reclaim.sql"),
  },
  {
    name: "0017_photos_for_person_fix",
    path: resolve(dataRoot, "migrations/0017_photos_for_person_fix.sql"),
  },
  {
    name: "0018_face_id_in_person_photos",
    path: resolve(dataRoot, "migrations/0018_face_id_in_person_photos.sql"),
  },
  {
    name: "0019_media_job_purpose",
    path: resolve(dataRoot, "migrations/0019_media_job_purpose.sql"),
  },
  {
    name: "0020_rematch_photos_on_reference_enroll",
    path: resolve(dataRoot, "migrations/0020_rematch_photos_on_reference_enroll.sql"),
  },
  { name: "0021_map_locations", path: resolve(dataRoot, "migrations/0021_map_locations.sql") },
  { name: "0022_catalog", path: resolve(dataRoot, "migrations/0022_catalog.sql") },
  { name: "0023_trip_budget_catalog", path: resolve(dataRoot, "migrations/0023_trip_budget_catalog.sql") },
];

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('convia_schema_migrations'))",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS public.convia_schema_migrations (
      name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of migrations) {
      const sql = await readFile(migration.path, "utf8");
      const sha256 = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ sha256: string }>(
        "SELECT sha256 FROM public.convia_schema_migrations WHERE name = $1",
        [migration.name],
      );
      if (applied.rows.length) {
        if (applied.rows[0].sha256 !== sha256)
          throw new Error(`Applied migration changed: ${migration.name}`);
        console.log(`Already applied: ${migration.name}`);
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO public.convia_schema_migrations(name, sha256) VALUES($1,$2)",
        [migration.name, sha256],
      );
      console.log(`Applied: ${migration.name}`);
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
