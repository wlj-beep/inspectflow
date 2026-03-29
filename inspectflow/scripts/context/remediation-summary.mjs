#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const COMMANDS = [
  {
    name: "markdownLineBudget",
    argv: ["scripts/context/check-markdown-line-budgets.mjs"]
  },
  {
    name: "codeLineBudget",
    argv: ["scripts/context/check-code-line-budgets.mjs"]
  },
  {
    name: "shardLinks",
    argv: ["scripts/context/validate-shard-links.mjs"]
  },
  {
    name: "largeUntracked",
    argv: ["scripts/context/detect-large-untracked.mjs"]
  },
  {
    name: "duplicateLargeFiles",
    argv: ["scripts/context/detect-duplicate-large-files.mjs"]
  }
];

function runCommand(argv) {
  const result = spawnSync(process.execPath, argv, {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return {
    ok: result.status === 0,
    status: Number.isInteger(result.status) ? result.status : 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mapMarkdownViolations(summary, source) {
  return Array.isArray(summary?.offenders)
    ? summary.offenders.map((item) => ({
        source,
        type: item.type || "markdown-line-budget",
        path: item.path,
        detail: `${item.lines} lines (${item.overBy} over)`
      }))
    : [];
}

function mapCodeViolations(summary, source) {
  return Array.isArray(summary?.offenders)
    ? summary.offenders.map((item) => ({
        source,
        type: item.type || "code-line-budget",
        path: item.path,
        detail: `${item.lines} lines (${item.overBy} over)`
      }))
    : [];
}

function mapShardViolations(stderr, source) {
  const findings = [];
  const pattern = /^-\s+(.+):(\d+)\s+->\s+(.+)\s+\(missing\s+(.+)\)$/;
  for (const line of String(stderr || "").split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;
    findings.push({
      source,
      type: "broken-shard-link",
      path: match[1],
      detail: `line ${match[2]} -> ${match[3]} (missing ${match[4]})`
    });
  }
  return findings;
}

function mapLargeUntrackedViolations(summary, source) {
  return Array.isArray(summary?.largeFiles)
    ? summary.largeFiles.map((item) => ({
        source,
        type: "large-untracked-file",
        path: item.path,
        detail: `${item.kib} KiB`
      }))
    : [];
}

function mapDuplicateLargeFileViolations(summary, source) {
  return Array.isArray(summary?.duplicateGroups)
    ? summary.duplicateGroups.map((group) => ({
        source,
        type: "duplicate-large-file-group",
        path: group.files.join(", "),
        detail: `${group.fileCount} files, ${group.totalBytes} bytes`
      }))
    : [];
}

const results = [];
const violations = [];

for (const command of COMMANDS) {
  const response = runCommand(command.argv);
  const stdoutTrimmed = response.stdout.trim();
  const parsed = stdoutTrimmed ? safeParseJson(stdoutTrimmed) : null;
  const summary = parsed && typeof parsed === "object" ? parsed : null;
  const commandViolations = [];

  if (command.name === "markdownLineBudget") {
    commandViolations.push(...mapMarkdownViolations(summary, command.name));
  } else if (command.name === "codeLineBudget") {
    commandViolations.push(...mapCodeViolations(summary, command.name));
  } else if (command.name === "shardLinks") {
    commandViolations.push(...mapShardViolations(response.stderr || stdoutTrimmed, command.name));
  } else if (command.name === "largeUntracked") {
    commandViolations.push(...mapLargeUntrackedViolations(summary, command.name));
  } else if (command.name === "duplicateLargeFiles") {
    commandViolations.push(...mapDuplicateLargeFileViolations(summary, command.name));
  }

  if (!response.ok && commandViolations.length === 0) {
    commandViolations.push({
      source: command.name,
      type: "command-failed",
      path: null,
      detail: String(response.stderr || stdoutTrimmed || "command_failed").trim()
    });
  }

  violations.push(...commandViolations);
  results.push({
    name: command.name,
    ok: response.ok,
    status: summary?.status || (response.ok ? "ok" : "violation"),
    summary,
    violations: commandViolations,
    error: response.ok ? null : String(response.stderr || stdoutTrimmed || "command_failed").trim()
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  results,
  violations,
  counts: {
    total: results.length,
    ok: results.filter((item) => item.ok).length,
    violations: violations.length
  }
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(violations.length ? 1 : 0);
