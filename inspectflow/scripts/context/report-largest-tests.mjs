#!/usr/bin/env node

import fs from "node:fs";
import { getTrackedFiles, existsAndFile, countFileLines } from "./report-utils.mjs";

const DEFAULT_LIMIT = 20;

function parseArgs(argv) {
  let limit = DEFAULT_LIMIT;
  let prefix = "";

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--limit") {
      const parsed = Number(argv[i + 1]);
      i += 1;
      if (Number.isInteger(parsed) && parsed > 0) limit = parsed;
      continue;
    }
    if (token.startsWith("--limit=")) {
      const parsed = Number(token.slice("--limit=".length));
      if (Number.isInteger(parsed) && parsed > 0) limit = parsed;
      continue;
    }
    if (token === "--prefix") {
      prefix = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (token.startsWith("--prefix=")) {
      prefix = token.slice("--prefix=".length);
    }
  }

  return { limit, prefix };
}

const { limit, prefix } = parseArgs(process.argv);
const rows = [];

for (const pathname of getTrackedFiles()) {
  if (!pathname.startsWith("frontend/tests/") && !pathname.startsWith("backend/test/")) continue;
  if (prefix && !pathname.startsWith(prefix)) continue;
  if (!pathname.match(/\.(?:js|jsx|ts|tsx)$/)) continue;
  if (!existsAndFile(pathname)) continue;

  const content = fs.readFileSync(pathname, "utf8");
  const lines = countFileLines(pathname);
  const bytes = Buffer.byteLength(content, "utf8");
  rows.push({
    path: pathname,
    lines,
    bytes,
    kib: Number((bytes / 1024).toFixed(1))
  });
}

rows.sort((a, b) => b.lines - a.lines || b.bytes - a.bytes || a.path.localeCompare(b.path));

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      filter: { prefix: prefix || "" },
      counts: { trackedFiles: rows.length },
      largest: rows.slice(0, limit)
    },
    null,
    2
  )}\n`
);
