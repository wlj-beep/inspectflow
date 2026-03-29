#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const DEFAULT_THRESHOLD_KB = 200;

function parseArgs(argv) {
  let thresholdKb = DEFAULT_THRESHOLD_KB;
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--threshold-kb" || arg === "--threshold" || arg === "-t") {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) thresholdKb = parsed;
      i += 1;
      continue;
    }
    if (arg.startsWith("--threshold-kb=") || arg.startsWith("--threshold=")) {
      const parsed = Number(arg.slice(arg.indexOf("=") + 1));
      if (Number.isFinite(parsed) && parsed > 0) thresholdKb = parsed;
    }
  }
  return { thresholdKb };
}

function getTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

const { thresholdKb } = parseArgs(process.argv);
const thresholdBytes = thresholdKb * 1024;
const candidates = [];

for (const pathname of getTrackedFiles()) {
  if (!fs.existsSync(pathname)) continue;
  const stat = fs.statSync(pathname);
  if (!stat.isFile() || stat.size < thresholdBytes) continue;
  candidates.push({ path: pathname, bytes: stat.size });
}

const hashes = new Map();
for (const candidate of candidates) {
  const data = fs.readFileSync(candidate.path);
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  const bucket = hashes.get(hash) || { hash, files: [], totalBytes: 0 };
  bucket.files.push(candidate.path);
  bucket.totalBytes += candidate.bytes;
  hashes.set(hash, bucket);
}

const duplicateGroups = [...hashes.values()]
  .filter((group) => group.files.length > 1)
  .map((group) => ({
    hash: group.hash,
    fileCount: group.files.length,
    totalBytes: group.totalBytes,
    files: group.files.sort()
  }))
  .sort((a, b) => b.totalBytes - a.totalBytes || b.fileCount - a.fileCount || a.hash.localeCompare(b.hash));

const summary = {
  generatedAt: new Date().toISOString(),
  threshold: {
    kb: thresholdKb,
    bytes: thresholdBytes
  },
  counts: {
    scannedLargeFiles: candidates.length,
    duplicateGroups: duplicateGroups.length
  },
  duplicateGroups,
  status: duplicateGroups.length ? "violation" : "ok"
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exit(duplicateGroups.length ? 1 : 0);

