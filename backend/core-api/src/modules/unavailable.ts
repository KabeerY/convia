import type { CoreModule } from "../module-contract.js";

export function unavailableModule(name: string): CoreModule {
  return { name, register() {} };
}
