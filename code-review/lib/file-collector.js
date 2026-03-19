/**
 * Collects files to review for incremental (PR diff) mode.
 *
 * Runs `git diff --name-only` to find changed files, filters to
 * reviewable source paths, and returns file content + diff text
 * for each file.
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

// Source paths that are in scope for review (relative to repo root)
const INCLUDE_PATTERNS = [
  /^inspectflow\/backend\/src\//,
  /^inspectflow\/frontend\/src\//,
];

// Paths to always exclude even if they match INCLUDE_PATTERNS
const EXCLUDE_PATTERNS = [
  /\.test\.js$/,
  /\.spec\.js$/,
  /\/scripts\//,      // DB migration/seed scripts
  /\/future\//,       // Pre-built future modules (not yet integrated)
  /code-review\//,    // This system itself
];

/**
 * Returns true if a repo-relative file path should be reviewed.
 */
function isReviewable(filePath) {
  const included = INCLUDE_PATTERNS.some((p) => p.test(filePath));
  if (!included) return false;
  const excluded = EXCLUDE_PATTERNS.some((p) => p.test(filePath));
  return !excluded;
}

/**
 * Runs a git command in the repo root and returns trimmed stdout.
 * Returns empty string on error.
 */
function git(command, repoRoot) {
  try {
    return execSync(`git -C "${repoRoot}" ${command}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    console.warn(`[file-collector] git command failed: git ${command}`);
    console.warn(`[file-collector] ${err.message}`);
    return "";
  }
}

/**
 * Collects files changed between baseRef and headRef.
 * Returns an array of file descriptors:
 *   { filePath, absolutePath, content, diff }
 *
 * @param {string} repoRoot - Absolute path to the repository root
 * @param {string} baseRef  - Base commit SHA or branch (e.g. "main")
 * @param {string} headRef  - Head commit SHA or branch (e.g. "HEAD")
 */
export async function collectIncremental(repoRoot, baseRef, headRef) {
  const root = resolve(repoRoot);

  // Get list of changed files (Added, Copied, Modified, Renamed only)
  const diffOutput = git(
    `diff --name-only --diff-filter=ACMR ${baseRef}...${headRef}`,
    root
  );

  if (!diffOutput) {
    console.log("[file-collector] No changed files found in diff range.");
    return [];
  }

  const changedPaths = diffOutput.split("\n").filter(Boolean);
  const reviewable = changedPaths.filter(isReviewable);

  if (reviewable.length === 0) {
    console.log(
      `[file-collector] ${changedPaths.length} file(s) changed, 0 are in review scope.`
    );
    return [];
  }

  console.log(
    `[file-collector] ${changedPaths.length} file(s) changed, ` +
    `${reviewable.length} in review scope.`
  );

  const files = [];
  for (const filePath of reviewable) {
    const absolutePath = join(root, filePath);

    if (!existsSync(absolutePath)) {
      console.warn(`[file-collector] Skipping missing file: ${filePath}`);
      continue;
    }

    let content;
    try {
      content = readFileSync(absolutePath, "utf8");
    } catch (err) {
      console.warn(`[file-collector] Could not read ${filePath}: ${err.message}`);
      continue;
    }

    // Get the unified diff for this specific file
    const diff = git(
      `diff ${baseRef}...${headRef} -- "${filePath}"`,
      root
    );

    files.push({ filePath, absolutePath, content, diff });
  }

  return files;
}

/**
 * Returns a formatted string describing a file for inclusion in a prompt.
 * Includes both the full file content and the diff (if available).
 */
export function formatFileForPrompt(fileDescriptor) {
  const { filePath, content, diff } = fileDescriptor;
  const lines = content.split("\n");
  const lineCount = lines.length;

  let out = `\n${"=".repeat(72)}\n`;
  out += `FILE: ${filePath} (${lineCount} lines)\n`;
  out += `${"=".repeat(72)}\n`;

  if (diff) {
    out += `\n--- DIFF (changed lines) ---\n`;
    out += diff;
    out += `\n--- END DIFF ---\n`;
  }

  out += `\n--- FULL FILE CONTENT ---\n`;
  out += content;
  out += `\n--- END FILE ---\n`;

  return out;
}
