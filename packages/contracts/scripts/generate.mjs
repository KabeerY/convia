import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = JSON.parse(
  readFileSync(resolve(root, "schemas/domain.schema.json"), "utf8"),
);
const definitions = source.$defs;
const names = Object.keys(definitions);

function referenceName(ref) {
  const name = ref.split("/").at(-1);
  if (!definitions[name]) throw new Error(`Unknown reference: ${ref}`);
  return name;
}

function tsType(schema) {
  if (schema.$ref) return referenceName(schema.$ref);
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum)
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.anyOf) return schema.anyOf.map(tsType).join(" | ");
  if (schema.oneOf) return schema.oneOf.map(tsType).join(" | ");
  if (Array.isArray(schema.type))
    return schema.type.map((type) => tsType({ ...schema, type })).join(" | ");
  if (schema.type === "string") return "string";
  if (schema.type === "number" || schema.type === "integer") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "null") return "null";
  if (schema.type === "array") return `Array<${tsType(schema.items ?? {})}>`;
  if (schema.type === "object") {
    if (!schema.properties) return "Record<string, unknown>";
    const required = new Set(schema.required ?? []);
    const props = Object.entries(schema.properties).map(
      ([name, value]) =>
        `  ${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${tsType(value)};`,
    );
    if (schema.additionalProperties === true)
      props.push("  [key: string]: unknown;");
    return `{\n${props.join("\n")}\n}`;
  }
  return "unknown";
}

function pyType(schema, hint = "Nested") {
  if (schema.$ref) return referenceName(schema.$ref);
  if (schema.const !== undefined)
    return `Literal[${JSON.stringify(schema.const)}]`;
  if (schema.enum)
    return `Literal[${schema.enum.map((value) => JSON.stringify(value)).join(", ")}]`;
  if (schema.anyOf)
    return schema.anyOf
      .map((item, index) => pyType(item, `${hint}${index}`))
      .join(" | ");
  if (schema.oneOf)
    return schema.oneOf
      .map((item, index) => pyType(item, `${hint}${index}`))
      .join(" | ");
  if (Array.isArray(schema.type))
    return schema.type
      .map((type) => pyType({ ...schema, type }, hint))
      .join(" | ");
  if (schema.type === "string") return "str";
  if (schema.type === "integer") return "int";
  if (schema.type === "number") return "float";
  if (schema.type === "boolean") return "bool";
  if (schema.type === "null") return "None";
  if (schema.type === "array")
    return `list[${pyType(schema.items ?? {}, `${hint}Item`)}]`;
  if (schema.type === "object") {
    if (!schema.properties) return "dict[str, object]";
    pyClass(hint, schema);
    return hint;
  }
  return "object";
}

function pyClass(name, schema) {
  const required = new Set(schema.required ?? []);
  const lines = [`class ${name}(TypedDict):`];
  const properties = Object.entries(schema.properties);
  if (!properties.length) lines.push("    pass");
  for (const [key, value] of properties) {
    const childName = `${name}${key
      .split("_")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join("")}`;
    const type = pyType(value, childName);
    lines.push(
      `    ${key}: ${required.has(key) ? type : `NotRequired[${type}]`}`,
    );
  }
  py.push(...lines, "");
}

const ts = `${[
  "// Generated from schemas/domain.schema.json. Do not edit.",
  ...names.map((name) => `export type ${name} = ${tsType(definitions[name])};`),
].join("\n\n")}\n`;

const py = [
  '"""Generated from schemas/domain.schema.json. Do not edit."""',
  "from __future__ import annotations",
  "from typing import Literal, NotRequired, TypeAlias, TypedDict",
  "",
];
for (const name of names) {
  const schema = definitions[name];
  if (schema.type === "object" && schema.properties) {
    pyClass(name, schema);
  } else {
    py.push(`${name}: TypeAlias = ${pyType(schema, name)}`, "");
  }
}

const paths = {
  "/v1/trips/{trip_id}/change-sets": {
    parameters: [
      {
        name: "trip_id",
        in: "path",
        required: true,
        schema: { $ref: "#/components/schemas/Id" },
      },
    ],
    get: {
      summary:
        "List a member's trip decisions with actor ballots and current revisions",
      responses: {
        200: {
          description: "Decision summaries",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/DecisionSummary" },
              },
            },
          },
        },
      },
    },
    post: {
      summary: "Publish one add-activity change set (V0)",
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PublishV0ChangeSetRequest" },
          },
        },
      },
      responses: {
        201: {
          description: "Published decision",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DecisionSummary" },
            },
          },
        },
      },
    },
  },
  "/v1/change-sets/{change_set_id}/votes": {
    parameters: [
      {
        name: "change_set_id",
        in: "path",
        required: true,
        schema: { $ref: "#/components/schemas/Id" },
      },
    ],
    post: {
      summary: "Cast ballot using the current decision revision",
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/BallotRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Updated decision",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DecisionSummary" },
            },
          },
        },
        409: { description: "Revision conflict or closed decision" },
      },
    },
  },
  "/v1/change-sets/{change_set_id}": {
    parameters: [
      {
        name: "change_set_id",
        in: "path",
        required: true,
        schema: { $ref: "#/components/schemas/Id" },
      },
    ],
    get: {
      summary: "Read an authorized decision",
      responses: {
        200: {
          description: "Decision summary",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DecisionSummary" },
            },
          },
        },
      },
    },
  },
  "/v1/itinerary-items/{logical_item_id}": {
    parameters: [
      {
        name: "logical_item_id",
        in: "path",
        required: true,
        schema: { $ref: "#/components/schemas/Id" },
      },
    ],
    patch: {
      summary: "Direct item edits are refused; propose a change",
      responses: {
        409: { description: "DECISION_LOCKED or PROPOSAL_REQUIRED" },
      },
    },
  },
};
const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Convia transport contracts",
    version: "0.2.0",
    description:
      "Shared domain and V0 decision API contracts. Successful decision responses are raw JSON resources.",
  },
  paths,
  components: { schemas: definitions },
};

const outputs = new Map([
  ["generated/typescript/index.ts", ts],
  ["generated/python/convia_contracts/types.py", py.join("\n")],
  [
    "generated/python/convia_contracts/schema.json",
    `${JSON.stringify(source, null, 2)}\n`,
  ],
  ["openapi.yaml", `${JSON.stringify(openapi, null, 2)}\n`],
]);

const check = process.argv.includes("--check");
for (const [path, content] of outputs) {
  const target = resolve(root, path);
  if (check) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      console.error(`Stale generated contract: ${path}`);
      process.exitCode = 1;
    }
  } else {
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, content);
    console.log(`Generated ${path}`);
  }
}
