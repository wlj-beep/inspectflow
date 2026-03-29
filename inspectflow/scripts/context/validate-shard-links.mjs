#!/usr/bin/env node

import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const filesToScan = [
  "docs/backlog.md",
  "WORKLOG.md",
  "WORKLOG.archive-2026-03-12-to-2026-03-22.md"
];
const argv = process.argv.slice(2);
let mode = "strict";

for (const arg of argv) {
  if (arg === "--warn") {
    mode = "warn";
  } else if (arg === "--strict") {
    mode = "strict";
  } else if (arg.startsWith("--mode=")) {
    const value = arg.slice("--mode=".length).trim();
    if (value === "warn" || value === "strict") {
      mode = value;
    }
  }
}

const pathLikePattern = /(?:`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
const allowedExtensions = new Set([
  ".md",
  ".markdown",
  ".rst",
  ".txt",
  ".json",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".csv",
  ".sql",
  ".sh",
  ".mjs"
]);
let trackedFilesCache = null;

function getTrackedFiles() {
  if (trackedFilesCache) return trackedFilesCache;
  try {
    trackedFilesCache = execSync("git ls-files -z", { cwd: repoRoot, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    trackedFilesCache = [];
  }
  return trackedFilesCache;
}

function isLikelyPath(value) {
  if (!value) return false;
  if (!value.includes("/") && !value.startsWith(".") && !value.includes(path.sep)) return false;
  if (value.includes(" ")) return false;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:")) return false;
  if (value.startsWith("/api/")) return false;
  if (value.startsWith("npm:") || value.startsWith("node:")) return false;
  if (value.startsWith("#")) return false;
  if (value.startsWith("BL-")) return false;
  if (value.includes("`")) return false;
  if (value.startsWith("$")) return false;
  if (value.includes("*") || value.includes("{") || value.includes("}")) return false;
  const ext = path.posix.extname(value);
  if (!ext) return false;
  return allowedExtensions.has(ext) || value.endsWith(".tar.gz");
}

function resolveTarget(sourceFile, rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith("file://")) return null;
  if (target.startsWith("http://") || target.startsWith("https://")) return null;
  if (target.startsWith("#")) return null;

  const fragmentIndex = target.indexOf("#");
  if (fragmentIndex !== -1) target = target.slice(0, fragmentIndex);
  const queryIndex = target.indexOf("?");
  if (queryIndex !== -1) target = target.slice(0, queryIndex);

  if (!isLikelyPath(target)) return null;

  const normalized = target.replace(/\\/g, "/");
  const sourceDir = path.dirname(path.join(repoRoot, sourceFile));
  const sourceRelative = path.resolve(sourceDir, normalized);
  if (fs.existsSync(sourceRelative)) return sourceRelative;

  const direct = path.resolve(repoRoot, normalized);
  if (fs.existsSync(direct)) return direct;

  const suffixMatches = getTrackedFiles()
    .filter((file) => file.endsWith(normalized))
    .map((file) => path.resolve(repoRoot, file));

  if (suffixMatches.length === 1) return suffixMatches[0];
  if (normalized.startsWith("./") || normalized.startsWith("../")) return sourceRelative;
  return direct;
}

function scanFile(relativePath) {
  const absPath = path.join(repoRoot, relativePath);
  const content = fs.readFileSync(absPath, "utf8");
  const lines = content.split(/\r?\n/);
  const findings = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let match;
    while ((match = pathLikePattern.exec(line)) !== null) {
      const rawTarget = match[1] || match[3] || "";
      if (!isLikelyPath(rawTarget)) continue;
      const resolved = resolveTarget(relativePath, rawTarget);
      if (!fs.existsSync(resolved)) {
        findings.push({
          source: relativePath,
          line: lineIndex + 1,
          target: rawTarget,
          resolved
        });
      }
    }
    pathLikePattern.lastIndex = 0;
  }

  return findings;
}

const allFindings = filesToScan.flatMap(scanFile);

if (allFindings.length > 0) {
  const header = mode === "warn" ? "Broken shard links detected (warn mode):" : "Broken shard links detected:";
  console.error(header);
  for (const finding of allFindings) {
    const missing = finding.resolved ? path.relative(repoRoot, finding.resolved) : finding.target;
    console.error(`- ${finding.source}:${finding.line} -> ${finding.target} (missing ${missing})`);
  }
  if (mode === "warn") {
    console.warn(`Shard link validation completed in warn mode with ${allFindings.length} broken reference(s).`);
    process.exit(0);
  }
  process.exit(1);
}

console.log("Shard link validation passed.");
