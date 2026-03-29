#!/usr/bin/env node

import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const POLICIES = [
  {
    label: "var/load",
    root: "var/load",
    maxAgeDays: 10,
    maxBytes: 256 * 1024
  },
  {
    label: "var/update-bundles",
    root: "var/update-bundles",
    maxAgeDays: 10,
    maxBytes: 320 * 1024
  }
];

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatAgeDays(ageMs) {
  return `${(ageMs / (24 * 60 * 60 * 1000)).toFixed(1)}d`;
}

function parseArgs(argv) {
  let apply = false;
  let root = REPO_ROOT;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      apply = false;
      continue;
    }
    if (arg === "--root") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--root requires a path argument");
      }
      root = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      return { help: true, apply, root };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, apply, root };
}

async function walkFiles(entryPath, collected = []) {
  const entryStat = await stat(entryPath);
  if (entryStat.isFile()) {
    collected.push({
      path: entryPath,
      size: entryStat.size,
      mtimeMs: entryStat.mtimeMs
    });
    return collected;
  }

  if (!entryStat.isDirectory()) {
    return collected;
  }

  const entries = await readdir(entryPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory() || entry.isFile()) {
      // Recurse into nested bundle/load directories while keeping a stable sort order.
      // eslint-disable-next-line no-await-in-loop
      await walkFiles(childPath, collected);
    }
  }

  return collected;
}

async function summarizeUnit(unitPath) {
  const unitStat = await stat(unitPath);
  if (unitStat.isFile()) {
    return {
      path: unitPath,
      kind: "file",
      fileCount: 1,
      totalBytes: unitStat.size,
      newestMtimeMs: unitStat.mtimeMs
    };
  }

  const files = await walkFiles(unitPath);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const newestMtimeMs = files.reduce((newest, file) => Math.max(newest, file.mtimeMs), 0);

  return {
    path: unitPath,
    kind: "directory",
    fileCount: files.length,
    totalBytes,
    newestMtimeMs
  };
}

async function getUnits(policyRoot) {
  const entries = await readdir(policyRoot, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  const units = [];
  for (const entry of entries) {
    const unitPath = path.join(policyRoot, entry.name);
    if (entry.isDirectory() || entry.isFile()) {
      // eslint-disable-next-line no-await-in-loop
      units.push(await summarizeUnit(unitPath));
    }
  }

  return units;
}

function shouldPrune(unit, policy, nowMs) {
  const ageMs = nowMs - unit.newestMtimeMs;
  return ageMs >= policy.maxAgeDays * 24 * 60 * 60 * 1000 || unit.totalBytes >= policy.maxBytes;
}

async function main() {
  const { help, apply, root } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(`Usage: node scripts/cleanup-var.mjs [--dry-run] [--apply] [--root <repo-root>]`);
    console.log("");
    console.log("Default mode is dry-run. Use --apply to delete matched units.");
    return;
  }

  const nowMs = Date.now();
  const actions = [];

  for (const policy of POLICIES) {
    const policyRoot = path.join(root, policy.root);
    let units = [];
    try {
      units = await getUnits(policyRoot);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const unit of units) {
      if (!shouldPrune(unit, policy, nowMs)) {
        continue;
      }

      actions.push({
        policy,
        unit,
        ageMs: nowMs - unit.newestMtimeMs
      });
    }
  }

  actions.sort((left, right) => left.unit.path.localeCompare(right.unit.path));

  const deletedBytes = actions.reduce((sum, action) => sum + action.unit.totalBytes, 0);
  const modeLabel = apply ? "apply" : "dry-run";

  console.log(`var cleanup (${modeLabel})`);
  for (const policy of POLICIES) {
    console.log(`- ${policy.label}: age >= ${policy.maxAgeDays}d or size >= ${formatBytes(policy.maxBytes)}`);
  }
  console.log("");

  if (actions.length === 0) {
    console.log("No cleanup candidates found.");
    return;
  }

  console.log("Cleanup candidates:");
  for (const action of actions) {
    const { unit, policy, ageMs } = action;
    const relPath = path.relative(root, unit.path) || unit.path;
    const reasonParts = [];
    if (ageMs >= policy.maxAgeDays * 24 * 60 * 60 * 1000) {
      reasonParts.push(`age ${formatAgeDays(ageMs)} >= ${policy.maxAgeDays}d`);
    }
    if (unit.totalBytes >= policy.maxBytes) {
      reasonParts.push(`size ${formatBytes(unit.totalBytes)} >= ${formatBytes(policy.maxBytes)}`);
    }
    const reason = reasonParts.join(", ");
    console.log(`- ${relPath} (${unit.kind}, ${unit.fileCount} file(s), ${formatBytes(unit.totalBytes)}): ${reason}`);
  }

  console.log("");
  console.log(`Total cleanup candidates: ${actions.length}`);
  console.log(`Total bytes eligible for removal: ${formatBytes(deletedBytes)}`);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to delete these candidates.");
    return;
  }

  for (const action of actions) {
    // eslint-disable-next-line no-await-in-loop
    await rm(action.unit.path, { recursive: true, force: true });
    const relPath = path.relative(root, action.unit.path) || action.unit.path;
    console.log(`Deleted ${relPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
