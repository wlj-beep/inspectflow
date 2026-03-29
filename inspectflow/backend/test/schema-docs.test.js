import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");

function runSchemaDocsValidate() {
  return execFileSync("npm", ["run", "--silent", "docs:schema:validate"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test"
    }
  });
}

describe("BL-170 schema docs coverage", () => {
  it("validates that docs/data-model.md covers every table in schema.sql", () => {
    const report = JSON.parse(runSchemaDocsValidate());
    expect(report.status).toBe("ok");
    expect(report.counts.missingTables).toBe(0);
    expect(report.counts.schemaTables).toBe(report.counts.documentedTables);
  });
});
