#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_PATH_PREFIXES = ["frontend/src/domains/jobflow/", "frontend/tests/", "backend/test/"];
const DEFAULT_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];

function parseArgs(argv) {
  let maxLines = DEFAULT_MAX_LINES;
  let prefixes = DEFAULT_PATH_PREFIXES.slice();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--max-lines" || arg === "--limit") {
      const parsed = Number(argv[i + 1]);
      if (Number.isInteger(parsed) && parsed > 0) maxLines = parsed;
      i += 1;
      continue;
    }
    if (arg.startsWith("--max-lines=") || arg.startsWith("--limit=")) {
      const parsed = Number(arg.slice(arg.indexOf("=") + 1));
      if (Number.isInteger(parsed) && parsed > 0) maxLines = parsed;
      continue;
    }
    if (arg === "--prefix") {
      prefixes = String(argv[i + 1] || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (arg.startsWith("--prefix=")) {
      prefixes = arg.slice(arg.indexOf("=") + 1)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return { maxLines, prefixes };
}

function getTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

function isTarget(pathname, prefixes) {
  return prefixes.some((prefix) => pathname.startsWith(prefix)) && DEFAULT_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

function countLines(pathname) {
  const content = fs.readFileSync(pathname, "utf8");
  return content.length ? content.split("\n").length : 0;
}

const { maxLines, prefixes } = parseArgs(process.argv.slice(2));
const files = [];
const offenders = [];

for (const pathname of getTrackedFiles()) {
  if (!isTarget(pathname, prefixes) || !fs.existsSync(pathname)) continue;
  const stat = fs.statSync(pathname);
  if (!stat.isFile()) continue;
  const lines = countLines(pathname);
  files.push({ path: pathname, lines, bytes: stat.size });
  if (lines > maxLines) offenders.push({ path: pathname, lines, bytes: stat.size, overBy: lines - maxLines });
}

files.sort((a, b) => b.lines - a.lines || b.bytes - a.bytes || a.path.localeCompare(b.path));
offenders.sort((a, b) => b.overBy - a.overBy || b.lines - a.lines || a.path.localeCompare(b.path));

const summary = {
  generatedAt: new Date().toISOString(),
  thresholds: { maxLines, prefixes },
  counts: {
    trackedFiles: files.length,
    offenders: offenders.length
  },
  topFiles: files.slice(0, 20),
  offenders,
  status: offenders.length ? "violation" : "ok"
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exit(offenders.length ? 1 : 0);
