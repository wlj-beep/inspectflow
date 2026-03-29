import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function runReport(script, args = []) {
  const scriptPath = path.join(ROOT, script);
  const output = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    encoding: "utf8"
  });
  return JSON.parse(output);
}

test("tracked inventory report includes extension and directory breakdowns", () => {
  const report = runReport("scripts/context/report-tracked-inventory.mjs", ["--limit", "5"]);

  assert.equal(typeof report.generatedAt, "string");
  assert.equal(typeof report.counts?.trackedFiles, "number");
  assert.ok(report.counts.trackedFiles > 0);
  assert.ok(Array.isArray(report.topExtensions));
  assert.ok(Array.isArray(report.topDirectories));
  assert.ok(report.topExtensions.length <= 5);
  assert.ok(report.topDirectories.length <= 5);
  assert.ok(report.topExtensions.every((row) => typeof row.extension === "string" && typeof row.count === "number"));
  assert.ok(report.topDirectories.every((row) => typeof row.directory === "string" && typeof row.count === "number"));
});

test("largest tracked report honors the optional prefix filter", () => {
  const report = runReport("scripts/context/report-largest-tracked.mjs", ["--limit", "3", "--prefix", "backend/src/"]);

  assert.deepEqual(report.filter, { prefix: "backend/src/" });
  assert.ok(Array.isArray(report.largest));
  assert.ok(report.largest.length <= 3);
  assert.ok(report.largest.every((row) => row.path.startsWith("backend/src/")));
  assert.ok(report.largest.every((row) => typeof row.bytes === "number" && row.bytes >= 0));
});

test("largest docs report includes byte and line counts", () => {
  const report = runReport("scripts/context/report-largest-docs.mjs", ["--limit", "3", "--prefix", "docs/operations/"]);

  assert.deepEqual(report.filter, { prefix: "docs/operations/" });
  assert.ok(Array.isArray(report.largest));
  assert.ok(report.largest.length <= 3);
  assert.ok(report.counts.docs >= report.largest.length);
  assert.ok(report.largest.every((row) => row.path.startsWith("docs/operations/")));
  assert.ok(report.largest.every((row) => typeof row.bytes === "number" && typeof row.lines === "number"));
});

test("largest tests report scans frontend and backend test trees", () => {
  const report = runReport("scripts/context/report-largest-tests.mjs", ["--limit", "4"]);

  assert.deepEqual(report.filter, { prefix: "" });
  assert.ok(Array.isArray(report.largest));
  assert.ok(report.largest.length <= 4);
  assert.ok(report.counts.trackedFiles >= report.largest.length);
  assert.ok(report.largest.every((row) => row.path.startsWith("frontend/tests/") || row.path.startsWith("backend/test/")));
  assert.ok(report.largest.every((row) => typeof row.bytes === "number" && typeof row.lines === "number"));
});
