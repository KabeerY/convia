// Vercel adapter: keep the existing Fastify app and domain logic unchanged.

import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { createDomain } from "../src/domain.js";

const config = readConfig();
const domain = createDomain(config);
const app = await buildApp(config, domain);
await app.ready();

export default function handler(request: IncomingMessage, response: ServerResponse) {
  app.server.emit("request", request, response);
}
