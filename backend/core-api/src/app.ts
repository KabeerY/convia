import Fastify from "fastify";
import type { CoreConfig } from "./config.js";
import { readiness } from "./config.js";
import type { DomainPort } from "./module-contract.js";
import { registerModules } from "./modules/registry.js";

export async function buildApp(config: CoreConfig, domain: DomainPort) {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ status: "up", service: "core-api" }));
  app.get("/ready", async (_request, reply) => {
    const state = readiness(config);
    return reply.code(state.ready ? 200 : 503).send(state);
  });
  await registerModules(app, domain);
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
