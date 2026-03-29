#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_LIMIT = 20;

function parseArgs(argv) {
  const out = {
    limit: DEFAULT_LIMIT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--limit") {
      const raw = argv[i + 1];
      i += 1;
      const parsed = Number(raw);
      if (Number.isInteger(parsed) && parsed > 0) out.limit = parsed;
      continue;
    }
    if (token.startsWith("--limit=")) {
      const parsed = Number(token.slice("--limit=".length));
      if (Number.isInteger(parsed) && parsed > 0) out.limit = parsed;
    }
  }

  return out;
}

function getTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

function topLevelPrefix(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return path.extname(parts[0] || "") ? "(root)" : parts[0] || ".";
  return parts[0];
}

function extensionOf(filePath) {
  const ext = path.extname(filePath);
  if (!ext) return "(none)";
  if (filePath.endsWith(".tar.gz")) return ".tar.gz";
  return ext;
}

function buildSummary(limit) {
  const files = getTrackedFiles();
  const byPrefix = new Map();
  const byExtension = new Map();
  const byDir = new Map();
  let bytes = 0;

  for (const pathname of files) {
    if (!fs.existsSync(pathname)) continue;
    const stat = fs.statSync(pathname);
    if (!stat.isFile()) continue;

    const prefix = topLevelPrefix(pathname);
    const dir = path.dirname(pathname).replace(/\\/g, "/");
    const ext = extensionOf(pathname);

    bytes += stat.size;
    byPrefix.set(prefix, (byPrefix.get(prefix) || 0) + 1);
    byExtension.set(ext, (byExtension.get(ext) || 0) + 1);
    byDir.set(dir, (byDir.get(dir) || 0) + 1);
  }

  const toEntries = (map, keyName) =>
    [...map.entries()]
      .map(([key, count]) => ({ [keyName]: key, count }))
      .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])))
      .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      trackedFiles: files.length,
      trackedBytes: bytes
    },
    topPrefixes: toEntries(byPrefix, "prefix"),
    topExtensions: toEntries(byExtension, "extension"),
    topDirectories: toEntries(byDir, "directory")
  };
}

const { limit } = parseArgs(process.argv);
process.stdout.write(`${JSON.stringify(buildSummary(limit), null, 2)}\n`);
