import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import type { DomainPort } from "./module-contract.js";

const config = readConfig();
const domain: DomainPort = {
  async resolveContext() {
    throw new Error("auth session mapping unavailable until PR-02");
  },
  async authorize() {
    throw new Error("authorization unavailable until PR-02");
  },
  async transaction() {
    throw new Error("transactions unavailable until PR-02");
  },
  async execute() {
    throw new Error("commands unavailable until PR-02");
  },
  async query() {
    throw new Error("queries unavailable until PR-02");
  },
};

const app = await buildApp(config, domain);
await app.listen({ host: "0.0.0.0", port: config.PORT });
