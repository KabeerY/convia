import { fileURLToPath } from "node:url";

export const dataRoot = fileURLToPath(
  new URL("../../../../data-model/", import.meta.url),
);
