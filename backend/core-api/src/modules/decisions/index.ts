import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError } from "../../domain.js";
import type { CoreModule } from "../../module-contract.js";

const id = z.string().min(1).max(128);
const params = z.object({ trip_id: id });
const decisionParams = z.object({ change_set_id: id });
const itemParams = z.object({ logical_item_id: id });
const add = z
  .object({
    action: z.literal("add"),
    new_item: z
      .object({
        title: z.string().trim().min(1).max(200),
        item_type: z.enum([
          "hotel",
          "flight",
          "poi",
          "package",
          "guide",
          "transfer",
          "meal",
          "free",
        ]),
        day_index: z.number().int().min(1).max(32767),
        starts_at: z.iso.datetime({ offset: true }),
        ends_at: z.iso.datetime({ offset: true }),
      })
      .strict(),
    cost_basis: z.literal("unknown").optional(),
  })
  .strict();
const publish = z
  .object({
    base_itinerary_version: z.number().int().min(0),
    title: z.string().trim().min(1).max(200),
    operations: z.tuple([add]),
    requested_closes_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
const ballot = z
  .object({
    vote: z.enum(["yes", "no"]),
    expected_revision: z.number().int().min(0),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new DomainError("INVALID_REQUEST", 400, result.error.message);
  return result.data;
}

export const decisionsModule: CoreModule = {
  name: "decisions",
  register(app: FastifyInstance, domain) {
    app.get("/v1/trips/:trip_id/change-sets", async (request) => {
      const { trip_id } = parse(params, request.params);
      return domain.query(
        "decision.list",
        await domain.resolveContext(request),
        trip_id,
      );
    });
    app.post("/v1/trips/:trip_id/change-sets", async (request, reply) => {
      const { trip_id } = parse(params, request.params);
      const body = parse(publish, request.body);
      const value = await domain.execute(
        "decision.publish",
        { ...body, trip_id },
        await domain.resolveContext(request),
      );
      return reply.code(201).send(value);
    });
    app.get("/v1/change-sets/:change_set_id", async (request) => {
      const { change_set_id } = parse(decisionParams, request.params);
      return domain.query(
        "decision.read",
        await domain.resolveContext(request),
        change_set_id,
      );
    });
    app.post("/v1/change-sets/:change_set_id/votes", async (request) => {
      const { change_set_id } = parse(decisionParams, request.params);
      const body = parse(ballot, request.body);
      const key = request.headers["idempotency-key"];
      if (
        key !== undefined &&
        (typeof key !== "string" || key.length < 1 || key.length > 128)
      )
        throw new DomainError("INVALID_IDEMPOTENCY_KEY", 400);
      return domain.execute(
        "decision.vote",
        {
          ...body,
          change_set_id,
          ...(key ? { idempotency_key: key } : {}),
        },
        await domain.resolveContext(request),
      );
    });
    app.get("/v1/trips/:trip_id/itinerary", async (request) => {
      const { trip_id } = parse(params, request.params);
      return domain.query(
        "itinerary.read",
        await domain.resolveContext(request),
        trip_id,
      );
    });
    app.get("/v1/trips/:trip_id/history", async (request) => {
      const { trip_id } = parse(params, request.params);
      return domain.query(
        "history.list",
        await domain.resolveContext(request),
        trip_id,
      );
    });
    app.patch("/v1/itinerary-items/:logical_item_id", async (request) => {
      const { logical_item_id } = parse(itemParams, request.params);
      const item = await domain.query<{ decision_locked: boolean }>(
        "item.read",
        await domain.resolveContext(request),
        logical_item_id,
      );
      if (item.decision_locked)
        throw new DomainError(
          "DECISION_LOCKED",
          409,
          "This item is locked by the group decision. Propose a change instead.",
        );
      throw new DomainError(
        "PROPOSAL_REQUIRED",
        409,
        "Plan changes require a group proposal.",
      );
    });
  },
};
