import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError } from "../../../domain.js";
import type { CoreModule } from "../../../module-contract.js";

const id = z.string().min(1).max(128);
const tripParams = z.object({ trip_id: id });
const requestParams = z.object({ request_id: id });

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const createTrip = z
  .object({
    title: z.string().trim().min(1).max(120),
    destination_city_id: z.string().min(1).max(128),
    start_date: date,
    end_date: date,
    capacity: z.number().int().min(1).max(200),
    visibility: z.enum(["private", "public"]).optional(),
    admission_policy: z.enum(["open", "approval", "invite_only"]).optional(),
    description: z.string().max(2000).optional(),
    timezone: z.string().min(1).max(64).optional(),
    home_currency: z.string().min(3).max(3).optional(),
    origin_city_id: z.string().min(1).max(128).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

const issueInvite = z
  .object({
    target_role: z.enum(["participant", "guest"]),
    max_uses: z.number().int().min(1).max(1000),
    expires_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const redeemInvite = z
  .object({
    trip_id: id,
    code: z.string().min(1).max(512),
  })
  .strict();

const joinRequest = z
  .object({
    introduction: z.string().max(1000).optional(),
  })
  .strict();

const reviewRequest = z
  .object({
    trip_id: id,
    decision: z.enum(["accepted", "declined"]),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new DomainError("INVALID_REQUEST", 400, result.error.message);
  return result.data;
}

export const tripsModule: CoreModule = {
  name: "trips",
  register(app: FastifyInstance, domain) {
    app.get("/v1/trips", async (request) => {
      return domain.query("trip.list", await domain.resolveContext(request));
    });
    app.post("/v1/trips", async (request, reply) => {
      const body = parse(createTrip, request.body);
      const value = await domain.execute(
        "trip.create",
        body,
        await domain.resolveContext(request),
      );
      return reply.code(201).send(value);
    });
    app.get("/v1/trips/:trip_id", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return domain.query(
        "trip.read",
        await domain.resolveContext(request),
        trip_id,
      );
    });
    app.get("/v1/trips/:trip_id/members", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return domain.query(
        "trip.members",
        await domain.resolveContext(request),
        trip_id,
      );
    });
    app.get("/v1/trips/:trip_id/join-requests", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return domain.query(
        "trip.join_requests",
        await domain.resolveContext(request),
        trip_id,
      );
    });
    app.post("/v1/trips/:trip_id/invites", async (request, reply) => {
      const { trip_id } = parse(tripParams, request.params);
      const body = parse(issueInvite, request.body);
      const value = await domain.execute(
        "invite.issue",
        { ...body, trip_id },
        await domain.resolveContext(request),
      );
      return reply.code(201).send(value);
    });
    app.post("/v1/invites/redeem", async (request) => {
      const body = parse(redeemInvite, request.body);
      return domain.execute(
        "invite.redeem",
        body,
        await domain.resolveContext(request),
      );
    });
    app.post("/v1/trips/:trip_id/join-requests", async (request, reply) => {
      const { trip_id } = parse(tripParams, request.params);
      const body = parse(joinRequest, request.body ?? {});
      const value = await domain.execute(
        "admission.request",
        { ...body, trip_id },
        await domain.resolveContext(request),
      );
      return reply.code(201).send(value);
    });
    app.post("/v1/join-requests/:request_id/review", async (request) => {
      const { request_id } = parse(requestParams, request.params);
      const body = parse(reviewRequest, request.body);
      return domain.execute(
        "admission.review",
        { ...body, request_id },
        await domain.resolveContext(request),
      );
    });
  },
};
