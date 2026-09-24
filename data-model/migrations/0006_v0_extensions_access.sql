-- V0 extensions-schema access. On Supabase-hosted databases pgcrypto lives in
-- the `extensions` schema, and the custom command/runtime roles created in
-- 0002 have USAGE only on `public`. Without USAGE on `extensions`, digest()
-- stays invisible even with the schema on the function search_path (0005),
-- surfacing as error 42883. Guarded so local databases without an
-- `extensions` schema still apply cleanly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    GRANT USAGE ON SCHEMA extensions TO convia_command_owner, convia_runtime;
  END IF;
END $$;
