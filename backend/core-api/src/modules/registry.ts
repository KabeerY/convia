import type { FastifyInstance } from "fastify";
import type { CoreModule, DomainPort } from "../module-contract.js";
import { conversationsModule } from "./conversations/index.js";
import { decisionsModule } from "./decisions/index.js";
import { discoveryModule } from "./discovery/http/index.js";
import { guidesModule } from "./guides/index.js";
import { mediaCatalogueModule } from "./media-catalogue/http/index.js";
import { notificationsModule } from "./notifications/index.js";
import { tripsModule } from "./trips/http/index.js";
import { v0Module } from "./v0/index.js";

export const modules: CoreModule[] = [
  tripsModule,
  decisionsModule,
  conversationsModule,
  notificationsModule,
  discoveryModule,
  guidesModule,
  mediaCatalogueModule,
  v0Module,
];

export async function registerModules(
  app: FastifyInstance,
  domain: DomainPort,
): Promise<void> {
  for (const module of modules) await module.register(app, domain);
}
