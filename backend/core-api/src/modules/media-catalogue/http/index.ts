import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyServiceCredential } from "../../../auth/service-credentials.js";
import { readConfig } from "../../../config.js";
import { DomainError } from "../../../domain.js";
import type { CoreModule, DomainPort } from "../../../module-contract.js";
import { decodeUpload, extFor, serviceStorage } from "../storage.js";

const id = z.string().min(1).max(128);
const tripParams = z.object({ trip_id: id });
const mediaParams = z.object({ trip_id: id, media_id: id });
const faceParams = z.object({ face_id: id });
const jobParams = z.object({ job_id: id });

// 20MB of bytes ~= 26.7MB base64. The JSON body limit below must exceed this;
// Fastify's default 1MB is raised where these routes are registered.
const uploadBody = z
  .object({
    image_base64: z.string().min(100).max(30_000_000),
    content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  })
  .strict();
const referenceBody = uploadBody.extend({ consent: z.literal(true) }).strict();
const matchesQuery = z
  .object({
    subject_user_id: z.string().min(1).max(128).optional(),
    // ?unassigned=true lists detected faces with no accepted match.
    unassigned: z.string().optional(),
  })
  .strict();
const correctBody = z
  .object({ subject_user_id: z.string().min(1).max(128).nullable() })
  .strict();

const facePayload = z
  .object({
    trip_id: id,
    media_id: id,
    kind: z.enum(["photo_process", "reference_enroll"]),
    subject_user_id: z.string().min(1).max(128).optional(),
    model_version: z.string().min(1).max(64).optional(),
    faces: z
      .array(
        z
          .object({
            bbox: z
              .object({
                x: z.number().finite(),
                y: z.number().finite(),
                w: z.number().finite(),
                h: z.number().finite(),
              })
              .strict(),
            embedding: z.array(z.number().finite()).length(128),
            detection_score: z.number().finite().min(0).max(1).optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new DomainError("INVALID_REQUEST", 400, result.error.message);
  return result.data;
}

type MediaRow = {
  media_id: string;
  status: string;
  content_type: string;
  byte_size: number;
  created_at: string;
  face_count: number;
};

export const mediaCatalogueModule: CoreModule = {
  name: "media-catalogue",
  register(app: FastifyInstance, domain: DomainPort) {
    const config = readConfig();

    async function storeAndEnqueue(
      tripId: string,
      body: z.infer<typeof uploadBody>,
      context: Awaited<ReturnType<DomainPort["resolveContext"]>>,
      jobKind: "photo_process" | "reference_enroll",
      consentContext: Record<string, unknown>,
    ) {
      const decoded = decodeUpload(
        body.image_base64,
        body.content_type,
        config.MEDIA_MAX_UPLOAD_BYTES ?? 20000000,
      );
      const objectKey = `trip/${tripId}/${randomUUID()}.${extFor(decoded.contentType)}`;
      const storage = serviceStorage(config);
      const { error } = await storage.storage
        .from(config.MEDIA_BUCKET ?? "trip-media-private")
        .upload(objectKey, decoded.bytes, {
          contentType: decoded.contentType,
          upsert: false,
        });
      if (error)
        throw new DomainError("STORAGE_UPLOAD_FAILED", 503, error.message);
      // Checksum dedupe lives in SQL: a re-upload returns the existing row.
      // (The just-uploaded object may orphan on duplicates; GC bucket later.)
      return domain.execute(
        "media.upload",
        {
          trip_id: tripId,
          object_key: objectKey,
          checksum: decoded.checksum,
          content_type: decoded.contentType,
          byte_size: decoded.bytes.length,
          job_kind: jobKind,
          consent_context: consentContext,
        },
        context,
      );
    }

    // --- Member uploads: end-of-trip photos grouped later by profile pics.
    // Base64 photos exceed Fastify's default 1MB JSON limit; raise per-route.
    app.post(
      "/v1/trips/:trip_id/media",
      { bodyLimit: 32 * 1024 * 1024 },
      async (request, reply) => {
        const { trip_id } = parse(tripParams, request.params);
        const body = parse(uploadBody, request.body);
        const context = await domain.resolveContext(request);
        await domain.authorize("participant_command", context, trip_id);
        const value = await storeAndEnqueue(
          trip_id,
          body,
          context,
          "photo_process",
          {
            face_grouping: true,
          },
        );
        return reply.code(201).send(value);
      },
    );

    // --- Reference selfie: opt-in, explicit consent, subject is always self.
    app.post(
      "/v1/trips/:trip_id/face-references",
      { bodyLimit: 32 * 1024 * 1024 },
      async (request, reply) => {
        const { trip_id } = parse(tripParams, request.params);
        const body = parse(referenceBody, request.body);
        const context = await domain.resolveContext(request);
        await domain.authorize("participant_command", context, trip_id);
        const value = await storeAndEnqueue(
          trip_id,
          body,
          context,
          "reference_enroll",
          { face_grouping: true, reference_consent: true },
        );
        return reply.code(201).send(value);
      },
    );

    app.get("/v1/trips/:trip_id/media", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return {
        media: await domain.query<MediaRow[]>(
          "media.list",
          await domain.resolveContext(request),
          trip_id,
        ),
      };
    });

    app.get("/v1/trips/:trip_id/media/:media_id/url", async (request) => {
      const { trip_id, media_id } = parse(mediaParams, request.params);
      const context = await domain.resolveContext(request);
      const resolved = await domain.query<Record<string, string> | null>(
        "media.object",
        context,
        media_id,
      );
      if (!resolved || resolved.trip_id !== trip_id)
        throw new DomainError("MEDIA_NOT_FOUND", 404);
      const storage = serviceStorage(config);
      const { data, error } = await storage.storage
        .from(config.MEDIA_BUCKET ?? "trip-media-private")
        .createSignedUrl(resolved.object_key, 300);
      if (error)
        throw new DomainError("MEDIA_URL_UNAVAILABLE", 503, error.message);
      return { url: data.signedUrl, expires_in: 300 };
    });

    app.get("/v1/trips/:trip_id/face-references", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return {
        references: await domain.query(
          "face.references.list",
          await domain.resolveContext(request),
          trip_id,
        ),
      };
    });

    app.delete("/v1/trips/:trip_id/face-references", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      return domain.execute(
        "face.reference.revoke",
        { trip_id },
        await domain.resolveContext(request),
      );
    });

    // People strip + per-person photos + unassigned faces, one endpoint.
    app.get("/v1/trips/:trip_id/face-matches", async (request) => {
      const { trip_id } = parse(tripParams, request.params);
      const query = parse(matchesQuery, request.query);
      const context = await domain.resolveContext(request);
      if (query.subject_user_id)
        return {
          photos: await domain.query(
            "face.photos_for_person",
            context,
            trip_id,
            { subject_user_id: query.subject_user_id },
          ),
        };
      if (query.unassigned === "true")
        return {
          faces: await domain.query("face.unassigned", context, trip_id),
        };
      return {
        people: await domain.query("face.people", context, trip_id),
      };
    });

    app.post("/v1/faces/:face_id/correct", async (request) => {
      const { face_id } = parse(faceParams, request.params);
      const body = parse(correctBody, request.body);
      return domain.execute(
        "face.match.correct",
        { photo_face_id: face_id, subject_user_id: body.subject_user_id },
        await domain.resolveContext(request),
      );
    });

    app.get("/v1/jobs/:job_id", async (request) => {
      const { job_id } = parse(jobParams, request.params);
      const context = await domain.resolveContext(request);
      const status = await domain.query<Record<string, unknown> | null>(
        "media.job_status",
        context,
        job_id,
      );
      if (!status?.job_id) throw new DomainError("JOB_NOT_FOUND", 404);
      return status;
    });

    // --- Internal service API: MEDIA_SERVICE_TOKEN, never a user token.
    const serviceContext = (request: { id: string }) => ({
      actor: { userId: "media-worker", authSubject: "media-service" },
      requestId: request.id,
    });

    app.post("/v1/internal/media/jobs/claim", async (request) => {
      verifyServiceCredential(
        config,
        "media",
        request.headers["x-media-service-token"] as string | undefined,
      );
      const body = (request.body ?? {}) as { owner?: string };
      return (
        (await domain.execute(
          "media.job_claim",
          { owner: body.owner ?? "media-worker" },
          serviceContext(request),
        )) ?? { claimed: false }
      );
    });

    app.post("/v1/internal/media/jobs/complete", async (request) => {
      verifyServiceCredential(
        config,
        "media",
        request.headers["x-media-service-token"] as string | undefined,
      );
      const body = parse(
        z
          .object({
            job_id: id,
            owner: z.string().min(1).max(128).default("media-worker"),
            success: z.boolean().default(true),
            error: z.string().max(500).optional(),
          })
          .strict(),
        request.body,
      );
      return domain.execute(
        "media.job_complete",
        body,
        serviceContext(request),
      );
    });

    app.post("/v1/internal/media/results", async (request) => {
      verifyServiceCredential(
        config,
        "media",
        request.headers["x-media-service-token"] as string | undefined,
      );
      const input = parse(facePayload, request.body);
      // Reference enrollment must target an active trip member; the worker
      // echoes the uploader from Core's own claim response, and Core rechecks
      // membership here so a leaked token cannot enroll strangers.
      const subject = input.subject_user_id;
      if (input.kind === "reference_enroll") {
        if (!subject) throw new DomainError("SUBJECT_REQUIRED", 400);
        await domain.authorize(
          "member_read",
          {
            ...serviceContext(request),
            actor: { userId: subject, authSubject: "media-service" },
          },
          input.trip_id,
        );
      }
      return domain.execute(
        "face.result.ingest",
        { ...input, threshold: config.FACE_MATCH_THRESHOLD ?? 0.5 },
        {
          ...serviceContext(request),
          actor: {
            userId: subject ?? "media-worker",
            authSubject: "media-service",
          },
        },
      );
    });
  },
};
