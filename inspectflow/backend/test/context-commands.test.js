import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildBudgetRemediationHints } from "../../scripts/context/budget-policy.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");
const VALIDATE_IGNORE_SCRIPT = path.join(REPO_ROOT, "scripts/context/validate-ignore-manifests.mjs");
const VALIDATE_SHARD_LINKS_SCRIPT = path.join(REPO_ROOT, "scripts/context/validate-shard-links.mjs");
const CLEANUP_WORKLOG_SCRIPT = path.join(REPO_ROOT, "scripts/cleanup-worklog.mjs");
const DETECT_LARGE_UNTRACKED_SCRIPT = path.join(REPO_ROOT, "scripts/context/detect-large-untracked.mjs");
const tempDirs = [];

function run(command, args, cwd = REPO_ROOT) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test"
    }
  }).trim();
}

function runProcess(command, args, cwd = REPO_ROOT) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test"
    }
  });
}

function parseJson(output) {
  return JSON.parse(output);
}

function makeTempDir(prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function copyIgnoreManifests(targetDir) {
  copyFileSync(path.join(REPO_ROOT, ".agentignore"), path.join(targetDir, ".agentignore"));
  copyFileSync(path.join(REPO_ROOT, ".rgignore"), path.join(targetDir, ".rgignore"));
}

function writeMinimalWorklogFixture(targetDir, { includeBrokenLink = false } = {}) {
  mkdirSync(path.join(targetDir, "docs"), { recursive: true });
  const worklogPath = path.join(targetDir, "WORKLOG.md");
  const archivePath = path.join(targetDir, "WORKLOG.archive-2026-03-12-to-2026-03-22.md");
  const today = new Date().toISOString().slice(0, 10);
  const backlogBody = includeBrokenLink
    ? [
        "# Backlog",
        "",
        "Broken shard link: [missing](./backlog/missing.md)"
      ].join("\n")
    : [
        "# Backlog",
        "",
        "Reference shard"
      ].join("\n");

  writeFileSync(path.join(targetDir, "docs", "backlog.md"), `${backlogBody}\n`);
  writeFileSync(
    worklogPath,
    [
      "# Work Log",
      "",
      "| Date | Change | Owner | Reference |",
      "| --- | --- | --- | --- |",
      "| 2000-01-01 | Old entry | @codex | [Archive](./WORKLOG.archive-2026-03-12-to-2026-03-22.md) |",
      `| ${today} | Recent entry | @codex | [Keep](./docs/backlog.md) |`,
      "",
      "## Archived Handoff Log",
      ""
    ].join("\n")
  );
  writeFileSync(
    archivePath,
    [
      "# Archive",
      "",
      "| Date | Change | Owner | Reference |",
      "| --- | --- | --- | --- |"
    ].join("\n")
  );
  return { worklogPath, archivePath };
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("BL-181..BL-195 context command surface", () => {
  it("reports jobflow surface size through the package alias sorted by line count", () => {
    const report = parseJson(run("npm", ["run", "--silent", "context:jobflow:sizes", "--", "--limit", "3"]));

    expect(report.filter).toEqual({ prefix: "frontend/src/domains/jobflow/" });
    expect(report.counts.scannedFiles).toBeGreaterThan(0);
    expect(report.largest).toHaveLength(3);
    expect(report.largest.every((item) => item.path.startsWith("frontend/src/domains/jobflow/"))).toBe(true);
    expect(report.largest[0].lines).toBeGreaterThanOrEqual(report.largest[1].lines);
    expect(report.largest[1].lines).toBeGreaterThanOrEqual(report.largest[2].lines);
  });

  it("prints the resolved context budget policy through the package alias", () => {
    const report = parseJson(run("npm", ["run", "--silent", "context:budget:policy"]));

    expect(report.source).toBe("scripts/context/budget.config.json");
    expect(report.policyPath).toContain("scripts/context/budget.config.json");
    expect(report.generatedAt).toEqual(expect.any(String));
    expect(report.policy.source.paths).toEqual(["frontend/src/domains/jobflow/"]);
    expect(report.policy.tests.paths).toEqual(["frontend/tests/", "backend/test/"]);
    expect(report.policy.data.approvedRoots).toEqual(["var/"]);
  });

  it("emits a machine-readable budget report with the resolved policy and counts", () => {
    const report = parseJson(run("npm", ["run", "--silent", "context:budget:report:compact"]));

    expect(report.source).toBe("scripts/context/budget.config.json");
    expect(report.policyPath).toContain("scripts/context/budget.config.json");
    expect(report.status).toBe("ok");
    expect(report.counts).toEqual(expect.objectContaining({ tracked: expect.any(Number), violations: expect.any(Number) }));
    expect(report.violations).toEqual(expect.any(Array));
    expect(report.topOffenders.docs).toEqual(expect.any(Array));
  });

  it("builds remediation hints that name the owning docs and fix paths", () => {
    const hints = buildBudgetRemediationHints(
      [
        { type: "doc-size", pathname: "docs/guide.md", bytes: 100, limit: 50 },
        { type: "source-lines", pathname: "frontend/src/domains/jobflow/InspectFlowApp.jsx", lines: 3000, limit: 2000 },
        { type: "data-size", pathname: "tmp/generated.bin", bytes: 500000, limit: 131072 }
      ],
      {
        source: { maxLines: 2000 },
        tests: { maxLines: 900 }
      }
    );

    expect(hints[0]).toContain("docs/operations/token-efficiency-commands.md");
    expect(hints.join("\n")).toContain("docs/backlog.md");
    expect(hints.join("\n")).toContain("InspectFlowApp.jsx");
    expect(hints.join("\n")).toContain("var/");
  });

  it("produces a read-only var retention preview through the package alias", () => {
    const report = parseJson(run("npm", ["run", "--silent", "context:var:retention:preview"]));

    expect(report.root).toBe(REPO_ROOT);
    expect(report.candidates.length).toBeGreaterThan(0);
    expect(report.totals.candidates).toBe(report.candidates.length);
    expect(report.candidates[0]).toEqual(
      expect.objectContaining({
        path: expect.any(String),
        kind: expect.any(String),
        reasons: expect.objectContaining({
          age: expect.any(Boolean),
          size: expect.any(Boolean)
        })
      })
    );
  });

  it("prints a dry-run cleanup preview for stale var artifacts", () => {
    const brokenDir = makeTempDir("inspectflow-var-cleanup-");
    const unitDir = path.join(brokenDir, "var", "load", "candidate-bundle");
    mkdirSync(unitDir, { recursive: true });
    const filePath = path.join(unitDir, "payload.json");
    writeFileSync(filePath, "x".repeat(1024));

    const stale = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);
    utimesSync(filePath, stale, stale);

    const output = run("node", [path.join(REPO_ROOT, "scripts/cleanup-var.mjs"), "--root", brokenDir]);

    expect(output).toContain("var cleanup (dry-run)");
    expect(output).toContain("var/load/candidate-bundle");
    expect(output).toContain("Dry-run only");
  });

  it("validates ignore manifests and flags missing baseline excludes", () => {
    const cleanReport = parseJson(run("npm", ["run", "--silent", "context:ignore:validate"]));
    expect(cleanReport.status).toBe("ok");
    expect(cleanReport.missing).toEqual([]);
    expect(cleanReport.files.every((file) => file.ordered)).toBe(true);

    const brokenDir = makeTempDir("inspectflow-ignore-broken-");
    copyIgnoreManifests(brokenDir);

    const agentIgnorePath = path.join(brokenDir, ".agentignore");
    const agentIgnore = readFileSync(agentIgnorePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line !== "var/")
      .join("\n");
    writeFileSync(agentIgnorePath, `${agentIgnore}\n`);

    let error;
    try {
      run("node", [VALIDATE_IGNORE_SCRIPT], brokenDir);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeTruthy();
    const brokenReport = parseJson(String(error.stdout || ""));
    expect(brokenReport.status).toBe("violation");
    expect(brokenReport.missing[0].missing).toContain("var/");
  });

  it("rejects reordered ignore manifests so the baseline stays deterministic", () => {
    const brokenDir = makeTempDir("inspectflow-ignore-order-");
    copyIgnoreManifests(brokenDir);

    const agentIgnorePath = path.join(brokenDir, ".agentignore");
    const reorderedAgentIgnore = readFileSync(agentIgnorePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    const swapped = [...reorderedAgentIgnore];
    const nodeModulesIndex = swapped.indexOf("node_modules/");
    const toolsIndex = swapped.indexOf(".tools/");
    swapped[nodeModulesIndex] = ".tools/";
    swapped[toolsIndex] = "node_modules/";
    writeFileSync(agentIgnorePath, `${swapped.join("\n")}\n`);

    let error;
    try {
      run("node", [VALIDATE_IGNORE_SCRIPT], brokenDir);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeTruthy();
    const brokenReport = parseJson(String(error.stdout || ""));
    expect(brokenReport.status).toBe("violation");
    expect(brokenReport.files[0].ordered).toBe(false);
    expect(brokenReport.files[0].missing).toEqual([]);
  });

  it("fails strict shard-link validation and allows warn mode for local triage", () => {
    const brokenDir = makeTempDir("inspectflow-shard-links-");
    writeMinimalWorklogFixture(brokenDir, { includeBrokenLink: true });

    const strict = runProcess("node", [VALIDATE_SHARD_LINKS_SCRIPT], brokenDir);
    expect(strict.status).toBe(1);
    expect(strict.stderr).toContain("Broken shard links detected:");
    expect(strict.stderr).toContain("docs/backlog.md");

    const warn = runProcess("node", [VALIDATE_SHARD_LINKS_SCRIPT, "--warn"], brokenDir);
    expect(warn.status).toBe(0);
    expect(warn.stderr).toContain("warn mode");
    expect(warn.stderr).toContain("docs/backlog.md");
  });

  it("archives aged worklog rows through the helper script", () => {
    const archiveDir = makeTempDir("inspectflow-worklog-archive-");
    const { worklogPath, archivePath } = writeMinimalWorklogFixture(archiveDir);

    const dryRun = runProcess(
      "node",
      [CLEANUP_WORKLOG_SCRIPT, "--dry-run", "--keep-days", "0", "--root", archiveDir],
      REPO_ROOT
    );
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain("Archive candidates:");
    expect(readFileSync(worklogPath, "utf8")).toContain("2000-01-01");

    const applyRun = runProcess(
      "node",
      [CLEANUP_WORKLOG_SCRIPT, "--apply", "--keep-days", "0", "--root", archiveDir],
      REPO_ROOT
    );
    expect(applyRun.status).toBe(0);
    expect(applyRun.stdout).toContain("Updated WORKLOG.md");
    expect(readFileSync(worklogPath, "utf8")).not.toContain("2000-01-01");
    expect(readFileSync(archivePath, "utf8")).toContain("2000-01-01");
  });

  it("flags a large untracked artifact in an isolated git repo", () => {
    const repoDir = makeTempDir("inspectflow-untracked-artifact-");
    execFileSync("git", ["init"], {
      cwd: repoDir,
      encoding: "utf8",
      env: process.env
    });

    writeFileSync(path.join(repoDir, "large.bin"), Buffer.alloc(2048, 0x41));

    const report = parseJson(
      execFileSync("node", [DETECT_LARGE_UNTRACKED_SCRIPT, "--threshold-kb", "1"], {
        cwd: repoDir,
        encoding: "utf8",
        env: process.env
      })
    );
    expect(report.counts.largeFiles).toBe(1);
    expect(report.largeFiles[0]).toMatchObject({
      path: "large.bin",
      kib: expect.any(Number)
    });
    expect(report.byPrefix[0]).toMatchObject({
      prefix: "(root)",
      largeFiles: 1
    });
  });
});
