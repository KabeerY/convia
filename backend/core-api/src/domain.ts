import { createClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import pg, { type PoolClient } from "pg";
import type { CoreConfig } from "./config.js";
import type {
  Actor,
  CommandContext,
  DomainPort,
  Policy,
  TransactionScope,
} from "./module-contract.js";

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message = code,
  ) {
    super(message);
  }
}

const commandNames = new Set([
  "calendar.command",
  "trip.create",
  "trip.settings",
  "invite.issue",
  "invite.redeem",
  "invite.revoke",
  "admission.request",
  "admission.withdraw",
  "admission.review",
  "member.leave",
  "member.remove",
  "member.restore",
  "member.delegate",
  "ownership.transfer",
  "decision.publish",
  "decision.vote",
  "v0.passport.save",
  "v0.chat.send",
  "v0.change.propose",
]);
const queryNames = new Set([
  "calendar.read",
  "trip.list",
  "trip.public_preview",
  "trip.read",
  "trip.members",
  "trip.join_requests",
  "conversation.list",
  "media.list",
  "decision.list",
  "decision.read",
  "itinerary.read",
  "history.list",
  "item.read",
  "v0.passport.read",
  "v0.discover.list",
  "v0.genome.read",
  "v0.chat.list",
  "v0.forks.list",
  "v0.events.latest",
  "v0.public.preview",
]);

function translate(error: unknown): never {
  if (error instanceof DomainError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  if (/^[A-Z_]+$/.test(message)) {
    const forbidden = /FORBIDDEN|REQUIRED|REMOVED_MEMBER|ADMISSION_CLOSED/.test(
      message,
    );
    const notFound = /NOT_FOUND/.test(message);
    throw new DomainError(message, forbidden ? 403 : notFound ? 404 : 409);
  }
  throw error;
}

export function createDomain(
  config: CoreConfig,
): DomainPort & { close(): Promise<void> } {
  if (
    !config.CORE_DATABASE_URL ||
    !config.SUPABASE_URL ||
    !config.SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new Error(
      "Core database and Supabase public Auth configuration are required",
    );
  }
  const pool = new pg.Pool({
    connectionString: config.CORE_DATABASE_URL,
    max: 10,
  });
  const auth = createClient(
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

  async function resolveContext(
    request: FastifyRequest,
  ): Promise<CommandContext> {
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "");
    if (!match) throw new DomainError("AUTH_REQUIRED", 401);
    const { data, error } = await auth.auth.getClaims(match[1]);
    if (error || !data?.claims) throw new DomainError("INVALID_SESSION", 401);
    const claims = data.claims;
    if (
      claims.iss !==
        (config.SUPABASE_JWT_ISSUER ?? `${config.SUPABASE_URL}/auth/v1`) ||
      claims.aud !== (config.SUPABASE_JWT_AUDIENCE ?? "authenticated") ||
      typeof claims.sub !== "string"
    )
      throw new DomainError("INVALID_SESSION", 401);
    const email = claims.email;
    if (typeof email !== "string") throw new DomainError("EMAIL_REQUIRED", 403);
    try {
      const result = await pool.query<{ user_id: string }>(
        "SELECT wm_bootstrap_user($1::uuid,$2::text,$3::text) AS user_id",
        [
          claims.sub,
          email,
          typeof claims.user_metadata?.full_name === "string"
            ? claims.user_metadata.full_name
            : email.split("@")[0],
        ],
      );
      return {
        actor: { userId: result.rows[0].user_id, authSubject: claims.sub },
        requestId: request.id,
      };
    } catch (error) {
      translate(error);
    }
  }

  async function authorize(
    policy: Policy,
    context: CommandContext,
    resourceId?: string,
  ): Promise<void> {
    if (policy === "public_projection") {
      if (!resourceId) throw new DomainError("RESOURCE_REQUIRED", 400);
      const result = await pool.query<{ value: unknown }>(
        "SELECT wm_trip_query($1,'trip.public_preview',$2) AS value",
        [context.actor.userId, resourceId],
      );
      if (result.rows[0]?.value == null)
        throw new DomainError("TRIP_NOT_FOUND", 404);
      return;
    }
    if (!resourceId) throw new DomainError("RESOURCE_REQUIRED", 400);
    const result = await pool.query<{ role: string | null }>(
      "SELECT wm_member_role($1,$2) AS role",
      [context.actor.userId, resourceId],
    );
    const role = result.rows[0]?.role;
    if (!role) throw new DomainError("MEMBERSHIP_REQUIRED", 403);
    if (policy === "member_read") return;
    if (policy === "participant_command" && role !== "guest") return;
    if (
      policy === "organizer_management" &&
      (role === "organizer" || role === "co_organizer")
    )
      return;
    // Future policies need their own resource-specific checks, not generic trip membership.
    throw new DomainError("POLICY_NOT_AVAILABLE", 403);
  }

  async function commandOn<TInput, TOutput>(
    client: pg.Pool | PoolClient,
    name: string,
    input: TInput,
    actor: Actor,
  ): Promise<TOutput> {
    if (!commandNames.has(name)) throw new DomainError("UNKNOWN_COMMAND", 400);
    try {
      const result = await client.query<{ value: TOutput }>(
        name.startsWith("calendar.")
          ? "SELECT wm_calendar_command($1,$3::jsonb) AS value WHERE $2::text = 'calendar.command'"
          : name.startsWith("v0.")
            ? "SELECT wm_v0_command($1,$2,$3::jsonb) AS value"
            : name.startsWith("decision.")
              ? "SELECT wm_decision_command($1,$2,$3::jsonb) AS value"
              : "SELECT wm_trip_command($1,$2,$3::jsonb) AS value",
        [actor.userId, name, JSON.stringify(input)],
      );
      return result.rows[0].value;
    } catch (error) {
      translate(error);
    }
  }

  async function queryOn<TOutput>(
    client: pg.Pool | PoolClient,
    name: string,
    actor: Actor,
    resourceId?: string,
    input?: unknown,
  ): Promise<TOutput> {
    if (name === "system.ready") {
      const result = await client.query<{ ok: number }>("SELECT 1 AS ok");
      return result.rows[0].ok as TOutput;
    }
    if (
      !queryNames.has(name) ||
      (name !== "trip.list" &&
        name !== "v0.passport.read" &&
        name !== "v0.discover.list" &&
        !resourceId)
    )
      throw new DomainError("UNKNOWN_QUERY", 400);
    try {
      const result = await client.query<{ value: TOutput }>(
        name.startsWith("calendar.")
          ? "SELECT wm_calendar_read($1,$3) AS value WHERE $2::text = 'calendar.read'"
          : name.startsWith("v0.")
            ? "SELECT wm_v0_query($1,$2,$3,$4::jsonb) AS value"
            : name.startsWith("decision.") ||
                name === "itinerary.read" ||
                name === "history.list" ||
                name === "item.read"
              ? "SELECT wm_decision_query($1,$2,$3) AS value"
              : "SELECT wm_trip_query($1,$2,$3) AS value",
        name.startsWith("v0.")
          ? [
              actor.userId,
              name,
              resourceId ?? null,
              JSON.stringify(input ?? {}),
            ]
          : [actor.userId, name, resourceId],
      );
      return result.rows[0].value;
    } catch (error) {
      translate(error);
    }
  }

  return {
    resolveContext,
    authorize,
    execute: (name, input, context) =>
      commandOn(pool, name, input, context.actor),
    query: (name, context, resourceId, input) =>
      queryOn(pool, name, context.actor, resourceId, input),
    async transaction<T>(
      context: CommandContext,
      run: (scope: TransactionScope) => Promise<T>,
    ): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const scope: TransactionScope = {
          id: context.requestId,
          authorize: (policy, resourceId) =>
            authorize(policy, context, resourceId),
          execute: (name, input) =>
            commandOn(client, name, input, context.actor),
          query: (name, resourceId, input) =>
            queryOn(client, name, context.actor, resourceId, input),
        };
        const value = await run(scope);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
