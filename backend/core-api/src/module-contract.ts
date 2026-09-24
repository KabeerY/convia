import type { FastifyInstance, FastifyRequest } from "fastify";

export type Actor = Readonly<{ userId: string; authSubject: string }>;
export type Policy =
  | "public_projection"
  | "member_read"
  | "participant_command"
  | "organizer_management"
  | "conversation_member"
  | "asset_access"
  | "contact_grant"
  | "location_recipient";

export interface CommandContext {
  actor: Actor;
  requestId: string;
  idempotencyKey?: string;
}

export interface TransactionScope {
  readonly id: string;
  authorize(policy: Policy, resourceId?: string): Promise<void>;
  execute<TInput, TOutput>(name: string, input: TInput): Promise<TOutput>;
  query<TOutput>(name: string, resourceId?: string): Promise<TOutput>;
}

export interface DomainPort {
  // PR-02 verifies the bearer session and maps its subject to a canonical user.
  // Never derive this context from a request body or query string.
  resolveContext(request: FastifyRequest): Promise<CommandContext>;
  authorize(
    policy: Policy,
    context: CommandContext,
    resourceId?: string,
  ): Promise<void>;
  transaction<T>(
    context: CommandContext,
    run: (scope: TransactionScope) => Promise<T>,
  ): Promise<T>;
  execute<TInput, TOutput>(
    name: string,
    input: TInput,
    context: CommandContext,
  ): Promise<TOutput>;
  query<TOutput>(
    name: string,
    context: CommandContext,
    resourceId?: string,
  ): Promise<TOutput>;
}

export interface ProviderAdapter<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

export interface CoreModule {
  readonly name: string;
  register(app: FastifyInstance, domain: DomainPort): Promise<void> | void;
}

export class UnavailableModuleError extends Error {
  readonly code = "MODULE_UNAVAILABLE";
  constructor(name: string) {
    super(`${name} is not implemented yet`);
  }
}
