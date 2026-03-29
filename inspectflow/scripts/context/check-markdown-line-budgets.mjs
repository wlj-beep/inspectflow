#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";

const DEFAULT_MAX_LINES = 400;

function parseArgs(argv) {
  let maxLines = DEFAULT_MAX_LINES;

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
    }
  }

  return { maxLines };
}

function getTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

function isMarkdown(pathname) {
  return pathname.endsWith(".md") || pathname.endsWith(".markdown") || pathname.endsWith(".rst") || pathname.endsWith(".txt");
}

function countLines(pathname) {
  const content = fs.readFileSync(pathname, "utf8");
  return content.length ? content.split("\n").length : 0;
}

const { maxLines } = parseArgs(process.argv.slice(2));
const offenders = [];
const files = [];

for (const pathname of getTrackedFiles()) {
  if (!isMarkdown(pathname) || !fs.existsSync(pathname)) continue;
  const stat = fs.statSync(pathname);
  if (!stat.isFile()) continue;
  const lines = countLines(pathname);
  files.push({ path: pathname, lines, bytes: stat.size });
  if (lines > maxLines) {
    offenders.push({ path: pathname, lines, bytes: stat.size, overBy: lines - maxLines });
  }
}

files.sort((a, b) => b.lines - a.lines || b.bytes - a.bytes || a.path.localeCompare(b.path));
offenders.sort((a, b) => b.overBy - a.overBy || b.lines - a.lines || a.path.localeCompare(b.path));

const summary = {
  generatedAt: new Date().toISOString(),
  thresholds: { maxLines },
  counts: {
    trackedMarkdown: files.length,
    offenders: offenders.length
  },
  topFiles: files.slice(0, 20),
  offenders,
  status: offenders.length ? "violation" : "ok"
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exit(offenders.length ? 1 : 0);
