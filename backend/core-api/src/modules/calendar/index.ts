import { z } from "zod";
import { DomainError } from "../../domain.js";
import type { CoreModule } from "../../module-contract.js";

const id = z.string().min(1).max(128);
const instant = z.iso.datetime({ offset: true });
const activity = z
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
    starts_at: instant,
    ends_at: instant,
    description: z.string().max(2000).default(""),
    location: z.string().max(200).default(""),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.ends_at) > Date.parse(value.starts_at),
    "End must be after start",
  );
const schemas = {
  "branch.create": z
    .object({
      title: z.string().trim().min(1).max(200),
      source_item_id: id,
      parent_branch_id: id.nullable(),
      starts_at: instant,
      rejoin_at: instant,
      rejoin_item_id: id.nullable(),
      rejoin_note: z.string().trim().min(1).max(200),
    })
    .strict(),
  "branch.join": z.object({ branch_id: id, joining: z.boolean() }).strict(),
  "branch.review": z
    .object({
      branch_id: id,
      expected_revision: z.number().int().min(0),
      starts_at: instant,
      rejoin_at: instant,
      rejoin_item_id: id.nullable(),
      rejoin_note: z.string().trim().min(1).max(200),
      source_item_id: id,
    })
    .strict(),
  change: z
    .object({
      branch_id: id.nullable(),
      item_id: id.nullable(),
      kind: z.enum(["add", "edit", "remove", "cancel"]),
      expected_revision: z.number().int().min(0),
      activity: activity.optional(),
    })
    .strict()
    .refine(
      (value) => !["add", "edit"].includes(value.kind) || !!value.activity,
      "Activity details are required",
    )
    .refine(
      (value) => !["edit", "remove"].includes(value.kind) || !!value.item_id,
      "Choose an existing activity",
    )
    .refine(
      (value) => value.kind !== "cancel" || !!value.branch_id,
      "Choose a branch",
    ),
  vote: z
    .object({
      proposal_id: id,
      vote: z.enum(["yes", "no"]),
      expected_revision: z.number().int().min(0),
    })
    .strict(),
  withdraw: z.object({ proposal_id: id }).strict(),
  attendance: z.object({ item_id: id, going: z.boolean() }).strict(),
  question: z
    .object({ item_id: id, body: z.string().trim().min(1).max(2000) })
    .strict(),
  reply: z
    .object({ proposal_id: id, body: z.string().trim().min(1).max(2000) })
    .strict(),
};
export const calendarModule: CoreModule = {
  name: "calendar",
  register(app, domain) {
    app.get("/v1/trips/:trip_id/calendar", async (request) => {
      const params = z.object({ trip_id: id }).safeParse(request.params);
      if (!params.success) throw new DomainError("INVALID_REQUEST", 400);
      const { trip_id } = params.data;
      return domain.query(
        "calendar.read",
        await domain.resolveContext(request),
        trip_id,
      );
    });
    for (const [action, schema] of Object.entries(schemas)) {
      app.post(`/v1/trips/:trip_id/calendar/${action}`, async (request) => {
        const params = z.object({ trip_id: id }).safeParse(request.params);
        const input = schema.safeParse(request.body);
        if (!params.success || !input.success)
          throw new DomainError(
            "INVALID_REQUEST",
            400,
            "Check the activity, dates and required fields.",
          );
        return domain.execute(
          "calendar.command",
          { ...input.data, trip_id: params.data.trip_id, action },
          await domain.resolveContext(request),
        );
      });
    }
  },
};
