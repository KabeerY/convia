import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ORIGIN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  CORE_DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  SUPABASE_JWT_ISSUER: z.string().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  TRIPPY_SERVICE_TOKEN: z.string().optional(),
  MEDIA_SERVICE_TOKEN: z.string().optional(),
  RUN_CAPABILITY_SECRET: z.string().optional(),
});

export type CoreConfig = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  return configSchema.parse(env);
}

export function readiness(config: CoreConfig): {
  ready: boolean;
  missing: string[];
} {
  const required = [
    "CORE_DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_JWT_ISSUER",
    "SUPABASE_JWT_AUDIENCE",
    "SUPABASE_PUBLISHABLE_KEY",
  ] as const;
  const missing = required.filter((key) => !config[key]);
  // A live database check is performed by the server's /ready handler.
  return {
    ready: missing.length === 0,
    missing: [...missing],
  };
}
