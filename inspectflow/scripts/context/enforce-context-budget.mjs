#!/usr/bin/env node
/**
 * Context budget enforcement gate (BL-177).
 *
 * Checks Tier 1 operational files, source files, and test files against
 * the limits defined in AGENTS.md §13. Exits non-zero on any violation.
 *
 * Usage:
 *   node scripts/context/enforce-context-budget.mjs
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// --- Limits (from AGENTS.md §13) ---
const TIER1_LINE_LIMIT = 200;
const TIER1_BYTE_LIMIT = 40 * 1024; // 40 KB
const SOURCE_LINE_LIMIT = 2000;
const TEST_LINE_LIMIT = 900;

// Tier 1 files — always-loaded operational files
const TIER1_FILES = [
  "STATUS.md",
  "WORKLOG.md",
  "AGENTS.md",
  "docs/backlog.md",
];

// Directories to scan for source and test budget violations
const SOURCE_DIRS = [
  "frontend/src",
  "backend/src",
];
const TEST_DIRS = [
  "frontend/tests",
  "backend/test",
];
const SOURCE_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs"]);

// ---

async function countLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content.split("\n").length;
}

async function getBytes(filePath) {
  const s = await stat(filePath);
  return s.size;
}

async function scanDir(dir, exts, limit, label, violations) {
  const abs = path.join(ROOT, dir);
  let entries;
  try {
    entries = await readdir(abs, { recursive: true });
  } catch {
    return; // directory may not exist — skip
  }
  for (const entry of entries) {
    const ext = path.extname(entry);
    if (!exts.has(ext)) continue;
    const filePath = path.join(abs, entry);
    let lines;
    try {
      lines = await countLines(filePath);
    } catch {
      continue;
    }
    if (lines > limit) {
      violations.push({ type: label, file: path.join(dir, entry), lines, limit });
    }
  }
}

async function main() {
  const violations = [];

  // Check Tier 1 files
  for (const rel of TIER1_FILES) {
    const filePath = path.join(ROOT, rel);
    let lines, bytes;
    try {
      [lines, bytes] = await Promise.all([countLines(filePath), getBytes(filePath)]);
    } catch {
      continue; // file may not exist yet
    }
    if (lines > TIER1_LINE_LIMIT) {
      violations.push({ type: "tier1-lines", file: rel, lines, limit: TIER1_LINE_LIMIT });
    }
    if (bytes > TIER1_BYTE_LIMIT) {
      violations.push({ type: "tier1-size", file: rel, bytes, limit: `${TIER1_BYTE_LIMIT / 1024} KB` });
    }
  }

  // Check source files
  for (const dir of SOURCE_DIRS) {
    await scanDir(dir, SOURCE_EXTS, SOURCE_LINE_LIMIT, "source-lines", violations);
  }

  // Check test files
  for (const dir of TEST_DIRS) {
    await scanDir(dir, SOURCE_EXTS, TEST_LINE_LIMIT, "test-lines", violations);
  }

  if (!violations.length) {
    console.log("PASS: context budget within policy.");
    process.exit(0);
  }

  console.error("FAIL: context budget violations detected.");
  console.error("");
  for (const v of violations) {
    if (v.lines !== undefined) {
      console.error(`  [${v.type}] ${v.file} — ${v.lines} lines > ${v.limit} limit`);
    } else {
      console.error(`  [${v.type}] ${v.file} — ${v.bytes} bytes > ${v.limit} limit`);
    }
  }
  console.error("");
  console.error("Remediation:");
  console.error("  - Split large source files into bounded modules.");
  console.error("  - Archive old entries from Tier 1 operational files.");
  console.error("  - See AGENTS.md §13 for thresholds and archival rules.");
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Budget check error:", err.message);
  process.exitCode = 1;
});
