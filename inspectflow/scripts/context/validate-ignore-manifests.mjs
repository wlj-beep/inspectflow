#!/usr/bin/env node

import fs from "node:fs";

const FILES = [".agentignore", ".rgignore"];
const REQUIRED_LINES = [
  ".DS_Store",
  "node_modules/",
  ".npm-cache/",
  ".tools/",
  "dist/",
  "build/",
  "coverage/",
  "playwright-report/",
  "test-results/",
  "var/",
  "*.log",
  "*.tsbuildinfo"
];

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeManifest(lines) {
  return lines.filter((line) => !line.startsWith("#"));
}

const report = {
  generatedAt: new Date().toISOString(),
  files: [],
  missing: []
};

for (const filePath of FILES) {
  const lines = readLines(filePath);
  const normalized = normalizeManifest(lines);
  const lineSet = new Set(normalized);
  const missing = REQUIRED_LINES.filter((line) => !lineSet.has(line));
  const unexpected = normalized.filter((line) => !REQUIRED_LINES.includes(line));
  const ordered = missing.length === 0
    && unexpected.length === 0
    && normalized.length === REQUIRED_LINES.length
    && normalized.every((line, index) => line === REQUIRED_LINES[index]);
  report.files.push({
    path: filePath,
    exists: fs.existsSync(filePath),
    missing,
    unexpected,
    ordered
  });
  if (missing.length || unexpected.length || !ordered) {
    report.missing.push({ path: filePath, missing, unexpected, ordered });
  }
}

report.status = report.missing.length ? "violation" : "ok";
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.missing.length ? 1 : 0);
