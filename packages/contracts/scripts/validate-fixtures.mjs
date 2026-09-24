import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const root = resolve(import.meta.dirname, "..");
const source = JSON.parse(
  readFileSync(resolve(root, "schemas/domain.schema.json"), "utf8"),
);
const ajv = new Ajv2020({
  strict: true,
  strictRequired: false,
  allErrors: true,
});
ajv.addSchema(source);

let count = 0;
for (const filename of readdirSync(resolve(root, "fixtures"))) {
  if (!filename.endsWith(".json")) continue;
  const fixture = JSON.parse(
    readFileSync(resolve(root, "fixtures", filename), "utf8"),
  );
  const validate = ajv.getSchema(`${source.$id}#/$defs/${fixture.schema}`);
  if (!validate)
    throw new Error(`Unknown schema in ${filename}: ${fixture.schema}`);
  const actual = validate(fixture.payload);
  if (actual !== fixture.valid) {
    throw new Error(
      `${filename}: expected valid=${fixture.valid}, got ${actual}; ${ajv.errorsText(validate.errors)}`,
    );
  }
  count++;
}
console.log(`Validated ${count} shared contract fixtures`);
