import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { createDomain } from "./domain.js";

const config = readConfig();
const domain = createDomain(config);

const app = await buildApp(config, domain);
app.addHook("onClose", () => domain.close());
await app.listen({ host: "0.0.0.0", port: config.PORT });
