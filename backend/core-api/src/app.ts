import cors from "@fastify/cors";
import Fastify from "fastify";
import type { CoreConfig } from "./config.js";
import { readiness } from "./config.js";
import { DomainError } from "./domain.js";
import type { DomainPort } from "./module-contract.js";
import { registerModules } from "./modules/registry.js";

export async function buildApp(config: CoreConfig, domain: DomainPort) {
  const app = Fastify({ logger: true });
  const origins = [
    ...(config.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ...(config.APP_ORIGIN ? [config.APP_ORIGIN.trim()] : []),
  ].filter(Boolean);
  const deduped = [...new Set(origins)];
  await app.register(cors, {
    origin: deduped.length > 0 ? deduped : ["http://localhost:4175"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
    credentials: true,
  });
  app.get("/health", async () => ({ status: "up", service: "core-api" }));
  app.get("/ready", async (_request, reply) => {
    const state = readiness(config);
    if (!state.ready) return reply.code(503).send(state);
    try {
      await domain.query("system.ready", {
        actor: { userId: "", authSubject: "" },
        requestId: "ready",
      });
      return reply.send(state);
    } catch {
      return reply
        .code(503)
        .send({ ready: false, missing: ["database connection"] });
    }
  });
  app.get("/v1/me", async (request) => {
    const context = await domain.resolveContext(request);
    return {
      user_id: context.actor.userId,
      auth_subject: context.actor.authSubject,
    };
  });
  await registerModules(app, domain);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send({
        request_id: request.id,
        error: { code: error.code, message: error.message },
      });
    }
    request.log.error(error);
    return reply.code(500).send({
      request_id: request.id,
      error: { code: "INTERNAL_ERROR", message: "Internal error" },
    });
  });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/v1/")) {
      return reply.code(503).send({
        request_id: request.id,
        error: {
          code: "MODULE_UNAVAILABLE",
          message: "This API route is not implemented yet",
        },
      });
    }
    return reply.code(404).send({
      request_id: request.id,
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });
  return app;
}
