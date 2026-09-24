-- V0 pgcrypto path fix. On Supabase-hosted databases pgcrypto lives in the
-- `extensions` schema, which SECURITY DEFINER functions with a pinned
-- search_path of `public, pg_temp` cannot see (error 42883 on digest()).
-- Local containers install pgcrypto into `public`, where this change is a
-- no-op: schemas missing from a search_path are skipped silently.
-- Only the two command functions call pgcrypto (digest, gen_random_bytes);
-- query/snapshot functions are unaffected.
ALTER FUNCTION wm_trip_command(text, text, jsonb) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION wm_decision_command(text, text, jsonb) SET search_path = public, extensions, pg_temp;
