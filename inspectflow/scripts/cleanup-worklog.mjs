#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const WORKLOG_PATH = path.join(REPO_ROOT, "WORKLOG.md");
const ARCHIVE_PATH = path.join(REPO_ROOT, "WORKLOG.archive-2026-03-12-to-2026-03-22.md");
const DEFAULT_KEEP_DAYS = 30;

function formatDateForCutoff(date) {
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv) {
  let apply = false;
  let keepDays = DEFAULT_KEEP_DAYS;
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
    if (arg === "--keep-days") {
      const next = argv[index + 1];
      if (!next) throw new Error("--keep-days requires a numeric value");
      keepDays = Number(next);
      if (!Number.isInteger(keepDays) || keepDays < 0) {
        throw new Error("--keep-days must be a non-negative integer");
      }
      index += 1;
      continue;
    }
    if (arg === "--root") {
      const next = argv[index + 1];
      if (!next) throw new Error("--root requires a path argument");
      root = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      return { help: true, apply, keepDays, root };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, apply, keepDays, root };
}

function findWorklogTableBounds(lines) {
  const start = lines.findIndex((line) => line.trim() === "| Date | Change | Owner | Reference |");
  if (start === -1) {
    throw new Error("Could not find WORKLOG completion table header");
  }

  const separator = start + 1;
  if (separator >= lines.length || !lines[separator].includes("| --- | --- | --- | --- |")) {
    throw new Error("Could not find WORKLOG completion table separator");
  }

  const sectionEnd = lines.findIndex((line, index) => index > separator && line.startsWith("## Archived Handoff Log"));
  const end = sectionEnd === -1 ? lines.length : sectionEnd;
  return { start, separator, end };
}

function parseCompletionRows(lines, bounds, cutoffDate) {
  const rows = [];
  for (let index = bounds.separator + 1; index < bounds.end; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (!line.startsWith("|")) continue;
    const match = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    if (!match) continue;
    const date = match[1];
    if (date < cutoffDate) {
      rows.push({ line, date });
    }
  }
  return rows;
}

function rewriteWorklog(lines, bounds, retainedRows) {
  const rewritten = [
    ...lines.slice(0, bounds.separator + 1),
    ...retainedRows.map((row) => row.line),
    ...lines.slice(bounds.end)
  ];
  return `${rewritten.join("\n")}\n`;
}

function appendArchiveRows(archiveText, movedRows) {
  if (movedRows.length === 0) return archiveText;
  const trimmed = archiveText.replace(/\s*$/, "");
  const body = movedRows.map((row) => row.line).join("\n");
  return `${trimmed}\n${body}\n`;
}

async function main() {
  const { help, apply, keepDays, root } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log("Usage: node scripts/cleanup-worklog.mjs [--dry-run] [--apply] [--keep-days <days>] [--root <repo-root>]");
    console.log("");
    console.log("Default mode is dry-run. Use --apply to move completion rows older than the keep window into the archive file.");
    return;
  }

  const worklogPath = path.join(root, "WORKLOG.md");
  const archivePath = path.join(root, "WORKLOG.archive-2026-03-12-to-2026-03-22.md");
  const worklogText = await readFile(worklogPath, "utf8");
  const archiveText = await readFile(archivePath, "utf8");
  const lines = worklogText.split("\n");
  const bounds = findWorklogTableBounds(lines);
  const cutoffDate = formatDateForCutoff(new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000));
  const movedRows = parseCompletionRows(lines, bounds, cutoffDate);
  const retainedRows = [];

  for (let index = bounds.separator + 1; index < bounds.end; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (!line.startsWith("|")) continue;
    const match = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    if (match && match[1] < cutoffDate) continue;
    retainedRows.push({ line });
  }

  const modeLabel = apply ? "apply" : "dry-run";
  console.log(`worklog cleanup (${modeLabel})`);
  console.log(`- keep-days: ${keepDays}`);
  console.log(`- cutoff date: ${cutoffDate}`);
  console.log("");

  if (movedRows.length === 0) {
    console.log("No completion rows are older than the rolling window.");
    return;
  }

  console.log("Archive candidates:");
  for (const row of movedRows) {
    console.log(`- ${row.date} | ${row.line}`);
  }
  console.log("");
  console.log(`Total rows eligible for archival: ${movedRows.length}`);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to move these rows into the archive file.");
    return;
  }

  const nextWorklogText = rewriteWorklog(lines, bounds, retainedRows);
  const nextArchiveText = appendArchiveRows(archiveText, movedRows);

  await writeFile(worklogPath, nextWorklogText, "utf8");
  await writeFile(archivePath, nextArchiveText, "utf8");

  console.log(`Updated ${path.relative(root, worklogPath)}`);
  console.log(`Updated ${path.relative(root, archivePath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
