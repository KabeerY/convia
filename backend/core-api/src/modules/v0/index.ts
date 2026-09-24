import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError } from "../../domain.js";
import type { CoreModule, DomainPort } from "../../module-contract.js";
import {
  type GenomeInput,
  groupGenome,
  matchProfile,
  type Profile,
} from "./match.js";
import {
  askTrippy,
  askTrippyService,
  type TrippySuggestion,
  trippyConfigured,
  trippyServiceConfigured,
} from "./trippy.js";

const id = z.string().min(1).max(128);
const tripParams = z.object({ trip_id: id });
const passport = z
  .object({
    schema_version: z.literal(1),
    confirmed_fields: z
      .object({
        interests: z.array(z.string().min(1).max(40)).max(8),
        pace: z.enum(["", "relaxed", "balanced", "active"]),
        budget_band: z.enum([
          "",
          "shoestring",
          "value",
          "mid",
          "premium",
          "luxury",
        ]),
      })
      .strict(),
  })
  .strict();
const iso = z.iso.datetime({ offset: true });
const move = z
  .object({
    source_item_id: id,
    base_itinerary_version: z.number().int().min(0),
    day_index: z.number().int().min(1),
    starts_at: iso,
    ends_at: iso,
  })
  .strict();
const item = z
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
    day_index: z.number().int().min(1),
    starts_at: iso,
    ends_at: iso,
  })
  .strict();
const fork = z
  .object({
    source_item_id: id,
    base_itinerary_version: z.number().int().min(0),
    alternative: item,
    rejoin_at: iso,
    rejoin_note: z.string().max(160).optional(),
  })
  .strict();
const chat = z
  .object({
    body: z.string().trim().min(1).max(1000),
    client_message_id: z.string().min(1).max(128).optional(),
  })
  .strict();
const filters = z.object({
  destination_city_id: z.string().max(128).optional(),
  start_date: z.iso.date().optional(),
});
type PlanItem = {
  item_id: string;
  title: string;
  day_index: number;
  starts_at: string;
  ends_at: string;
};
type Itinerary = { version: number; items?: PlanItem[] };
type Decision = { change_set_id: string };
type Candidate = {
  trip: { start_date: string; [key: string]: unknown };
  profile?: Profile;
  [key: string]: unknown;
};

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new DomainError("INVALID_REQUEST", 400, result.error.message);
  return result.data;
}

async function proposalFromTrippy(
  domain: DomainPort,
  context: Awaited<ReturnType<DomainPort["resolveContext"]>>,
  tripId: string,
  itinerary: Itinerary,
  draft: TrippySuggestion,
) {
  if (draft.action === "none") return null;
  if (
    !draft.day_index ||
    !draft.starts_at ||
    !draft.ends_at ||
    (draft.action !== "move" && !draft.title)
  )
    throw new Error(
      "Trippy did not provide a complete activity. Ask it to be more specific.",
    );
  const base_itinerary_version = Number(itinerary.version);
  if (!Number.isInteger(base_itinerary_version))
    throw new Error("The current plan version is unavailable.");
  if (draft.action === "add")
    return domain.execute<Record<string, unknown>, Decision>(
      "decision.publish",
      {
        trip_id: tripId,
        base_itinerary_version,
        title: `Trippy suggests ${draft.title}`,
        operations: [
          {
            action: "add",
            new_item: {
              title: draft.title,
              item_type: draft.item_type || "poi",
              day_index: draft.day_index,
              starts_at: draft.starts_at,
              ends_at: draft.ends_at,
            },
            cost_basis: "unknown",
          },
        ],
      },
      context,
    );
  if (!draft.source_item_id)
    throw new Error("Trippy did not identify an activity in the current plan.");
  if (draft.action === "move")
    return domain.execute<Record<string, unknown>, Decision>(
      "v0.change.propose",
      {
        trip_id: tripId,
        kind: "move",
        source_item_id: draft.source_item_id,
        base_itinerary_version,
        day_index: draft.day_index,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
      },
      context,
    );
  if (!draft.rejoin_at)
    throw new Error("Trippy did not provide a rejoin time.");
  return domain.execute<Record<string, unknown>, Decision>(
    "v0.change.propose",
    {
      trip_id: tripId,
      kind: "fork",
      source_item_id: draft.source_item_id,
      base_itinerary_version,
      alternative: {
        title: draft.title,
        item_type: draft.item_type || "poi",
        day_index: draft.day_index,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
      },
      rejoin_at: draft.rejoin_at,
      rejoin_note: draft.rejoin_note || "Meet back together",
    },
    context,
  );
}

export const v0Module: CoreModule = {
  name: "v0-trip-features",
  register(app: FastifyInstance, domain: DomainPort) {
    app.get("/v1/me/passport", async (request) =>
      domain.query("v0.passport.read", await domain.resolveContext(request)),
    );
    app.put("/v1/me/passport", async (request) => {
      const input = parse(passport, request.body);
      return domain.execute(
        "v0.passport.save",
        input,
        await domain.resolveContext(request),
      );
    });
    app.get("/v1/discover/trips", async (request) => {
      const input = parse(filters, request.query);
      const context = await domain.resolveContext(request);
      const [candidates, saved] = await Promise.all([
        domain.query<Candidate[]>(
          "v0.discover.list",
          context,
          undefined,
          input,
        ),
        domain.query<{ confirmed_fields: Record<string, unknown> }>(
          "v0.passport.read",
          context,
        ),
      ]);
      const result = (candidates || []).map((candidate) => ({
        ...candidate,
        ...matchProfile(saved?.confirmed_fields || {}, candidate.profile || {}),
      }));
      result.sort(
        (a, b) =>
          (b.match_score ?? -1) - (a.match_score ?? -1) ||
          String(a.trip.start_date).localeCompare(String(b.trip.start_date)),
      );
      return { trips: result };
    });
    app.get("/v1/public/trips/:trip_id", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      const context = await domain.resolveContext(request);
      const preview = await domain.query<Record<string, unknown> | null>(
        "v0.public.preview",
        context,
        trip_id,
      );
      if (!preview) throw new DomainError("TRIP_NOT_FOUND", 404);
      const raw = await domain.query<GenomeInput>(
        "v0.genome.read",
        context,
        trip_id,
      );
      return { ...preview, genome: groupGenome(raw) };
    });
    app.get("/v1/trips/:trip_id/genome", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return groupGenome(
        await domain.query<GenomeInput>(
          "v0.genome.read",
          await domain.resolveContext(request),
          trip_id,
        ),
      );
    });
    app.get("/v1/trips/:trip_id/forks", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return {
        forks: await domain.query(
          "v0.forks.list",
          await domain.resolveContext(request),
          trip_id,
        ),
      };
    });
    app.post("/v1/trips/:trip_id/moves", async (request, reply) => {
      const { trip_id } = parse(tripParams, request.params);
      const value = await domain.execute(
        "v0.change.propose",
        { ...parse(move, request.body), trip_id, kind: "move" },
        await domain.resolveContext(request),
      );
      return reply.code(201).send(value);
    });
    app.post("/v1/trips/:trip_id/forks", async (request, reply) => {
      const { trip_id } = parse(tripParams, request.params);
      const value = await domain.execute(
        "v0.change.propose",
        { ...parse(fork, request.body), trip_id, kind: "fork" },
        await domain.resolveContext(request),
      );
      return reply.code(201).send(value);
    });
    app.get("/v1/trips/:trip_id/chat", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return {
        messages: await domain.query(
          "v0.chat.list",
          await domain.resolveContext(request),
          trip_id,
        ),
      };
    });
    app.post("/v1/trips/:trip_id/chat", async (request, reply) => {
      const { trip_id } = parse(tripParams, request.params);
      const input = parse(chat, request.body);
      const context = await domain.resolveContext(request);
      const saved = await domain.execute<
        Record<string, unknown>,
        { message_id: string; duplicate?: boolean }
      >("v0.chat.send", { trip_id, ...input, kind: "member" }, context);
      if (!saved.duplicate && /(?:^|\s)@trippy\b/i.test(input.body)) {
        let answer =
          "Trippy is not configured yet. Please try again shortly.";
        let change_set_id: string | undefined;
        if (trippyServiceConfigured()) {
          try {
            const recent = await domain.query<Array<{
              message_id: string;
              display_name?: string;
              content_kind: string;
              body: string;
            }>>("v0.chat.list", context, trip_id);
            const history = recent
              .filter((message) => message.message_id !== saved.message_id)
              .slice(-15)
              .map((message) => ({
                role: message.content_kind === "agent" ? "assistant" as const : "user" as const,
                content: message.body,
                ...(message.content_kind === "agent" ? {} : { sender_name: message.display_name }),
              }));
            const query = input.body.replace(/@trippy\b/gi, "").trim();
            answer = query
              ? await askTrippyService(query, history, trip_id, context.actor.userId)
              : "Ask me a question after @trippy and I'll help.";
          } catch (error) {
            request.log.warn(error, "Trippy service failed");
            answer = "I couldn't answer that just now. Please try again in a moment.";
          }
        } else if (trippyConfigured()) {
          try {
            const [snapshot, itinerary] = await Promise.all([
              domain.query<{
                trip: Record<string, unknown>;
                settings?: { timezone?: string };
              }>("trip.read", context, trip_id),
              domain.query<Itinerary>("itinerary.read", context, trip_id),
            ]);
            const suggestion = await askTrippy(input.body, {
              trip: snapshot.trip,
              timezone: snapshot.settings?.timezone,
              itinerary: {
                version: itinerary.version,
                items: (itinerary.items || []).slice(0, 30).map((item) => ({
                  item_id: item.item_id,
                  title: item.title,
                  day_index: item.day_index,
                  starts_at: item.starts_at,
                  ends_at: item.ends_at,
                })),
              },
            });
            const decision = await proposalFromTrippy(
              domain,
              context,
              trip_id,
              itinerary,
              suggestion,
            );
            change_set_id = decision?.change_set_id;
            answer = decision
              ? `${suggestion.message} I prepared a proposal in the Decision Room. The itinerary changes only after your group approves it.`
              : suggestion.message;
          } catch (error) {
            request.log.warn(error, "Trippy suggestion failed");
            answer =
              "I couldn't prepare a safe proposal from that request. Try a clearer activity and time, or propose it on the calendar.";
          }
        }
        await domain.execute(
          "v0.chat.send",
          {
            trip_id,
            body: answer,
            kind: "agent",
            client_message_id: `agent_${saved.message_id}`,
            change_set_id,
          },
          context,
        );
      }
      return reply.code(201).send(saved);
    });
    app.get("/v1/trips/:trip_id/events", async (request, reply) => {
      const { trip_id } = parse(tripParams, request.params);
      const context = await domain.resolveContext(request);
      let last = Number(
        (
          await domain.query<{ sequence: number }>(
            "v0.events.latest",
            context,
            trip_id,
          )
        )?.sequence || 0,
      );
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(": connected\n\n");
      let polling = false;
      const timer = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          const latest = Number(
            (
              await domain.query<{ sequence: number }>(
                "v0.events.latest",
                context,
                trip_id,
              )
            )?.sequence || 0,
          );
          if (latest > last) {
            last = latest;
            reply.raw.write(
              `event: change\ndata: ${JSON.stringify({ sequence: latest })}\n\n`,
            );
          }
        } catch {
          // A revoked member must not keep a live trip stream.
          clearInterval(timer);
          reply.raw.end();
        } finally {
          polling = false;
        }
      }, 1800);
      reply.raw.on("close", () => clearInterval(timer));
    });
  },
};
