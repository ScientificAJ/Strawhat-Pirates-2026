import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const schemaText = execFileSync(
  "python3",
  ["scripts/python.py", "scripts/api_schema.py"],
  { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);
const schema = JSON.parse(schemaText);
const types = astToString(await openapiTS(schema));
const files = [
  [new URL("../packages/contracts/openapi.json", import.meta.url), schemaText],
  [new URL("../packages/contracts/api-types.ts", import.meta.url), types],
];
const check = process.argv.includes("--check");
for (const [path, content] of files) {
  if (check) {
    if (readFileSync(path, "utf8") !== content) {
      throw new Error(`API contract differs: ${fileURLToPath(path)}`);
    }
  } else {
    writeFileSync(path, content);
  }
}
process.stdout.write(check ? "API contracts match.\n" : "API contracts saved.\n");
