import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORE_DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  SUPABASE_JWT_ISSUER: z.string().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().optional(),
  TRIPPY_SERVICE_TOKEN: z.string().optional(),
  MEDIA_SERVICE_TOKEN: z.string().optional(),
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
  ] as const;
  const missing = required.filter((key) => !config[key]);
  // PR-02 adds actual database and auth checks. Configuration alone cannot establish readiness.
  return {
    ready: false,
    missing: missing.length
      ? [...missing]
      : ["database/auth integration (PR-02)"],
  };
}
