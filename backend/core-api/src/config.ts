import { z } from "zod";

const optionalNumber = (fallback: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, z.number().default(fallback));

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
  SUPABASE_SECRET_KEY: z.string().optional(),
  TRIPPY_SERVICE_TOKEN: z.string().optional(),
  MEDIA_SERVICE_TOKEN: z.string().optional(),
  RUN_CAPABILITY_SECRET: z.string().optional(),
  MEDIA_BUCKET: z.string().default("trip-media-private"),
  FACE_MATCH_THRESHOLD: optionalNumber(0.5).pipe(z.number().min(0).max(1)),
  FACE_MODEL_VERSION: z.string().default("sface-2024"),
  MEDIA_MAX_UPLOAD_BYTES: optionalNumber(20000000).pipe(z.number().int().positive()),
});

export type CoreConfig = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  // The initial team env used NEXT_PUBLIC names. They are public Supabase Auth
  // values, so Core may reuse them; database credentials stay server-only.
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  return configSchema.parse({
    ...env,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY:
      env.SUPABASE_PUBLISHABLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_JWT_ISSUER:
      env.SUPABASE_JWT_ISSUER ||
      (supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined),
    SUPABASE_JWT_AUDIENCE:
      env.SUPABASE_JWT_AUDIENCE || (supabaseUrl ? "authenticated" : undefined),
  });
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
