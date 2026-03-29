#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const POLICIES = [
  { label: "var/load", root: "var/load", maxAgeDays: 10, maxBytes: 256 * 1024 },
  { label: "var/update-bundles", root: "var/update-bundles", maxAgeDays: 10, maxBytes: 320 * 1024 }
];

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

async function walkFiles(entryPath, collected = []) {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) {
    collected.push({ path: entryPath, size: stat.size, mtimeMs: stat.mtimeMs });
    return collected;
  }
  if (!stat.isDirectory()) return collected;
  const entries = await fs.readdir(entryPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory() || entry.isFile()) {
      // Keep traversal deterministic so previews are comparable across runs.
      // eslint-disable-next-line no-await-in-loop
      await walkFiles(childPath, collected);
    }
  }
  return collected;
}

async function summarizeUnit(unitPath) {
  const stat = await fs.stat(unitPath);
  if (stat.isFile()) {
    return { path: unitPath, kind: "file", fileCount: 1, totalBytes: stat.size, newestMtimeMs: stat.mtimeMs };
  }
  const files = await walkFiles(unitPath);
  return {
    path: unitPath,
    kind: "directory",
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    newestMtimeMs: files.reduce((newest, file) => Math.max(newest, file.mtimeMs), 0)
  };
}

function shouldPrune(unit, policy, nowMs) {
  const ageMs = nowMs - unit.newestMtimeMs;
  return ageMs >= policy.maxAgeDays * 24 * 60 * 60 * 1000 || unit.totalBytes >= policy.maxBytes;
}

const nowMs = Date.now();
const report = {
  generatedAt: new Date().toISOString(),
  root: REPO_ROOT,
  policies: POLICIES,
  totals: {
    candidates: 0,
    eligibleBytes: 0
  },
  candidates: []
};

for (const policy of POLICIES) {
  const policyRoot = path.join(REPO_ROOT, policy.root);
  let entries = [];
  try {
    entries = await fs.readdir(policyRoot, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") continue;
    throw error;
  }

  for (const entry of entries) {
    const unitPath = path.join(policyRoot, entry.name);
    if (!entry.isDirectory() && !entry.isFile()) continue;
    // eslint-disable-next-line no-await-in-loop
    const unit = await summarizeUnit(unitPath);
    if (!shouldPrune(unit, policy, nowMs)) continue;
    const ageMs = nowMs - unit.newestMtimeMs;
    report.candidates.push({
      policy: policy.label,
      path: path.relative(REPO_ROOT, unit.path),
      kind: unit.kind,
      fileCount: unit.fileCount,
      totalBytes: unit.totalBytes,
      readableBytes: formatBytes(unit.totalBytes),
      ageDays: Number((ageMs / (24 * 60 * 60 * 1000)).toFixed(1)),
      reasons: {
        age: ageMs >= policy.maxAgeDays * 24 * 60 * 60 * 1000,
        size: unit.totalBytes >= policy.maxBytes
      }
    });
  }
}

report.candidates.sort((a, b) => a.path.localeCompare(b.path));
report.totals.candidates = report.candidates.length;
report.totals.eligibleBytes = report.candidates.reduce((sum, candidate) => sum + candidate.totalBytes, 0);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

