#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_THRESHOLD_KB = 200;

function parseArgs(argv) {
  let thresholdKb = DEFAULT_THRESHOLD_KB;
  const warnings = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--threshold-kb" || arg === "--threshold") {
      const raw = argv[i + 1];
      i += 1;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        thresholdKb = parsed;
      } else {
        warnings.push(`Ignoring invalid threshold value: ${String(raw)}`);
      }
      continue;
    }
    if (arg.startsWith("--threshold-kb=") || arg.startsWith("--threshold=")) {
      const raw = arg.slice(arg.indexOf("=") + 1);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        thresholdKb = parsed;
      } else {
        warnings.push(`Ignoring invalid threshold value: ${String(raw)}`);
      }
      continue;
    }
    if (arg === "-t") {
      const raw = argv[i + 1];
      i += 1;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        thresholdKb = parsed;
      } else {
        warnings.push(`Ignoring invalid threshold value: ${String(raw)}`);
      }
    }
  }

  return { thresholdKb, warnings };
}

function getUntrackedFiles() {
  const raw = execSync("git ls-files --others --exclude-standard -z", { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(2)} MiB`;
}

function topLevelPrefix(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return ".";
  if (parts.length === 1) return path.extname(parts[0]) ? "(root)" : parts[0];
  return parts[0];
}

const { thresholdKb, warnings } = parseArgs(process.argv.slice(2));
const thresholdBytes = thresholdKb * 1024;
const untracked = getUntrackedFiles();
const files = [];
const byPrefix = new Map();

for (const pathname of untracked) {
  if (!fs.existsSync(pathname)) continue;
  const stat = fs.statSync(pathname);
  if (!stat.isFile()) continue;

  const prefix = topLevelPrefix(pathname);
  const bucket = byPrefix.get(prefix) || { prefix, count: 0, bytes: 0, offenders: 0 };
  bucket.count += 1;
  bucket.bytes += stat.size;
  if (stat.size > thresholdBytes) {
    bucket.offenders += 1;
    files.push({
      path: pathname,
      bytes: stat.size,
      kib: Number((stat.size / 1024).toFixed(1))
    });
  }
  byPrefix.set(prefix, bucket);
}

files.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));

const summary = {
  generatedAt: new Date().toISOString(),
  threshold: {
    kb: thresholdKb,
    bytes: thresholdBytes
  },
  counts: {
    untracked: untracked.length,
    scannedFiles: byPrefix.size ? Array.from(byPrefix.values()).reduce((acc, item) => acc + item.count, 0) : 0,
    largeFiles: files.length
  },
  byPrefix: Array.from(byPrefix.values())
    .sort((a, b) => b.offenders - a.offenders || b.bytes - a.bytes || a.prefix.localeCompare(b.prefix))
    .map((item) => ({
      prefix: item.prefix,
      count: item.count,
      bytes: item.bytes,
      readableBytes: formatBytes(item.bytes),
      largeFiles: item.offenders
    })),
  largeFiles: files,
  warnings
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
