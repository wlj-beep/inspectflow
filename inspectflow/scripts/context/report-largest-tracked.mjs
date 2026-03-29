#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";

const DEFAULT_LIMIT = 20;

function parseArgs(argv) {
  const out = {
    limit: DEFAULT_LIMIT,
    prefix: ""
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--limit") {
      const parsed = Number(argv[i + 1]);
      i += 1;
      if (Number.isInteger(parsed) && parsed > 0) out.limit = parsed;
      continue;
    }
    if (token.startsWith("--limit=")) {
      const parsed = Number(token.slice("--limit=".length));
      if (Number.isInteger(parsed) && parsed > 0) out.limit = parsed;
      continue;
    }
    if (token === "--prefix") {
      out.prefix = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (token.startsWith("--prefix=")) {
      out.prefix = token.slice("--prefix=".length);
    }
  }

  return out;
}

function getTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

function buildSummary({ limit, prefix }) {
  const rows = [];
  for (const pathname of getTrackedFiles()) {
    if (prefix && !pathname.startsWith(prefix)) continue;
    if (!fs.existsSync(pathname)) continue;
    const stat = fs.statSync(pathname);
    if (!stat.isFile()) continue;
    rows.push({
      path: pathname,
      bytes: stat.size,
      kib: Number((stat.size / 1024).toFixed(1))
    });
  }

  rows.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));

  return {
    generatedAt: new Date().toISOString(),
    filter: { prefix: prefix || "" },
    counts: {
      scanned: rows.length
    },
    largest: rows.slice(0, limit)
  };
}

const args = parseArgs(process.argv);
process.stdout.write(`${JSON.stringify(buildSummary(args), null, 2)}\n`);
