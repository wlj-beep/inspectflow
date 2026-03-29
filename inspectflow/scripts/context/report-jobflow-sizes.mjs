#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_LIMIT = 20;
const PREFIX = "frontend/src/domains/jobflow/";
const ROOT = process.cwd();
const TARGET_ROOT = path.join(ROOT, PREFIX);
const TARGET_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

function parseArgs(argv) {
  let limit = DEFAULT_LIMIT;
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
    }
  }
  return { limit };
}

function walkTree(entryPath, collected = []) {
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) {
    collected.push({ path: entryPath, size: stat.size });
    return collected;
  }
  if (!stat.isDirectory()) return collected;

  const entries = fs
    .readdirSync(entryPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory() || entry.isFile()) {
      walkTree(childPath, collected);
    }
  }
  return collected;
}

const { limit } = parseArgs(process.argv);
const rows = [];

if (fs.existsSync(TARGET_ROOT)) {
  for (const file of walkTree(TARGET_ROOT)) {
    if (!TARGET_EXTENSIONS.has(path.extname(file.path))) continue;
    const content = fs.readFileSync(file.path, "utf8");
    const relativePath = path.relative(ROOT, file.path).replace(/\\/g, "/");
    const lines = content.length ? content.split("\n").length : 0;
    rows.push({
      path: relativePath,
      lines,
      bytes: Buffer.byteLength(content, "utf8"),
      kib: Number((Buffer.byteLength(content, "utf8") / 1024).toFixed(1))
    });
  }
}

rows.sort((a, b) => b.lines - a.lines || b.bytes - a.bytes || a.path.localeCompare(b.path));

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      filter: { prefix: PREFIX },
      counts: { scannedFiles: rows.length },
      largest: rows.slice(0, limit)
    },
    null,
    2
  )}\n`
);
