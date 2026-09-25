import { z } from "zod";
import type { CoreModule } from "../../module-contract.js";

// Read-only sample profiles from the supplied synthetic PS-11 guide catalogue.
export const guidesModule: CoreModule = {
  name: "guides",
  register(app, domain) {
    app.get("/v1/guides", async (request) => {
      const { city_id } = z.object({ city_id: z.string().max(128).optional() }).parse(request.query);
      const guides = await domain.query<unknown[]>(
        "v0.catalog.guides", await domain.resolveContext(request), undefined, { city_id },
      );
      return { guides: guides || [], sample_data: true };
    });
  },
};
