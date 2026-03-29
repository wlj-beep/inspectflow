#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const POLICY_PATH = path.join(SCRIPT_DIR, "budget.config.json");

export const DEFAULT_POLICY = {
  docs: {
    maxBytes: 40 * 1024,
    exemptPrefixes: ["docs/backlog/", "docs/operations/cycles/evidence/"],
    exemptFiles: ["WORKLOG.archive-2026-03-12-to-2026-03-22.md"]
  },
  source: {
    maxLines: 2000,
    paths: ["frontend/src/domains/jobflow/"],
    extensions: [".js", ".jsx", ".ts", ".tsx"]
  },
  tests: {
    maxLines: 900,
    paths: ["frontend/tests/", "backend/test/"],
    extensions: [".js", ".jsx", ".ts", ".tsx"]
  },
  data: {
    maxBytes: 128 * 1024,
    extensions: [".csv", ".json", ".sql", ".ndjson", ".log", ".xml", ".yaml", ".yml", ".tar.gz", ".zip"],
    exemptFiles: ["package-lock.json", "frontend/package-lock.json", "backend/package-lock.json"],
    approvedRoots: ["var/"]
  }
};

export function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function assertStringArray(value, label, fallback) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

export function assertPositiveInteger(value, label, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

export function normalizeBudgetPolicy(rawPolicy) {
  if (rawPolicy === null || typeof rawPolicy !== "object" || Array.isArray(rawPolicy)) {
    throw new Error("budget policy must be a JSON object");
  }

  const docs = rawPolicy.docs ?? {};
  const source = rawPolicy.source ?? {};
  const tests = rawPolicy.tests ?? {};
  const data = rawPolicy.data ?? {};

  return {
    docs: {
      maxBytes: assertPositiveInteger(docs.maxBytes, "docs.maxBytes", DEFAULT_POLICY.docs.maxBytes),
      exemptPrefixes: assertStringArray(docs.exemptPrefixes, "docs.exemptPrefixes", DEFAULT_POLICY.docs.exemptPrefixes),
      exemptFiles: assertStringArray(docs.exemptFiles, "docs.exemptFiles", DEFAULT_POLICY.docs.exemptFiles)
    },
    source: {
      maxLines: assertPositiveInteger(source.maxLines, "source.maxLines", DEFAULT_POLICY.source.maxLines),
      paths: assertStringArray(source.paths, "source.paths", DEFAULT_POLICY.source.paths),
      extensions: assertStringArray(source.extensions, "source.extensions", DEFAULT_POLICY.source.extensions)
    },
    tests: {
      maxLines: assertPositiveInteger(tests.maxLines, "tests.maxLines", DEFAULT_POLICY.tests.maxLines),
      paths: assertStringArray(tests.paths, "tests.paths", DEFAULT_POLICY.tests.paths),
      extensions: assertStringArray(tests.extensions, "tests.extensions", DEFAULT_POLICY.tests.extensions)
    },
    data: {
      maxBytes: assertPositiveInteger(data.maxBytes, "data.maxBytes", DEFAULT_POLICY.data.maxBytes),
      extensions: assertStringArray(data.extensions, "data.extensions", DEFAULT_POLICY.data.extensions),
      exemptFiles: assertStringArray(data.exemptFiles, "data.exemptFiles", DEFAULT_POLICY.data.exemptFiles),
      approvedRoots: assertStringArray(data.approvedRoots, "data.approvedRoots", DEFAULT_POLICY.data.approvedRoots)
    }
  };
}

export function loadEffectiveBudgetPolicy() {
  const rawPolicy = readJsonFile(POLICY_PATH);
  return {
    generatedAt: new Date().toISOString(),
    source: rawPolicy ? "scripts/context/budget.config.json" : "defaults",
    policyPath: POLICY_PATH,
    policy: rawPolicy ? normalizeBudgetPolicy(rawPolicy) : DEFAULT_POLICY
  };
}

function getTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

function isDoc(pathname) {
  return pathname.endsWith(".md") || pathname.endsWith(".markdown") || pathname.endsWith(".rst") || pathname.endsWith(".txt");
}

function isSource(pathname, policy) {
  return policy.source.paths.some((prefix) => pathname.startsWith(prefix)) && policy.source.extensions.some((ext) => pathname.endsWith(ext));
}

function isTest(pathname, policy) {
  return policy.tests.paths.some((prefix) => pathname.startsWith(prefix)) && policy.tests.extensions.some((ext) => pathname.endsWith(ext));
}

function hasDataExtension(pathname, policy) {
  return policy.data.extensions.some((ext) => pathname.endsWith(ext));
}

function countLines(pathname) {
  const content = fs.readFileSync(pathname, "utf8");
  return content.length ? content.split("\n").length : 0;
}

function sortAndTrim(items, key) {
  items.sort((left, right) => (right[key] ?? 0) - (left[key] ?? 0));
  return items.slice(0, 10);
}

export function evaluateBudgetPolicy(policy = DEFAULT_POLICY) {
  const summary = {
    generatedAt: new Date().toISOString(),
    source: "analysis",
    policyPath: POLICY_PATH,
    policy,
    thresholds: {
      docMaxBytes: policy.docs.maxBytes,
      sourceMaxLines: policy.source.maxLines,
      testMaxLines: policy.tests.maxLines,
      dataMaxBytes: policy.data.maxBytes
    },
    categories: {
      docs: { tracked: 0, oversized: 0, bytes: 0 },
      source: { tracked: 0, oversized: 0, lines: 0 },
      tests: { tracked: 0, oversized: 0, lines: 0 },
      data: { tracked: 0, oversized: 0, bytes: 0 },
      other: { tracked: 0 }
    },
    violations: [],
    topOffenders: {
      docs: [],
      source: [],
      tests: [],
      data: []
    }
  };

  for (const pathname of getTrackedFiles()) {
    if (!fs.existsSync(pathname)) continue;
    const stat = fs.statSync(pathname);
    if (!stat.isFile()) continue;

    const docCandidate = isDoc(pathname);
    const sourceCandidate = isSource(pathname, policy);
    const testCandidate = isTest(pathname, policy);
    const dataCandidate = hasDataExtension(pathname, policy);

    if (docCandidate) {
      summary.categories.docs.tracked += 1;
      const isExempt = policy.docs.exemptFiles.includes(pathname) || policy.docs.exemptPrefixes.some((prefix) => pathname.startsWith(prefix));
      if (!isExempt && stat.size > policy.docs.maxBytes) {
        summary.categories.docs.oversized += 1;
        summary.categories.docs.bytes += stat.size;
        summary.violations.push({
          type: "doc-size",
          pathname,
          bytes: stat.size,
          limit: policy.docs.maxBytes
        });
        summary.topOffenders.docs.push({ pathname, bytes: stat.size });
      }
    } else if (sourceCandidate) {
      summary.categories.source.tracked += 1;
      const lines = countLines(pathname);
      if (lines > policy.source.maxLines) {
        summary.categories.source.oversized += 1;
        summary.categories.source.lines += lines;
        summary.violations.push({
          type: "source-lines",
          pathname,
          lines,
          limit: policy.source.maxLines
        });
        summary.topOffenders.source.push({ pathname, lines });
      }
    } else if (testCandidate) {
      summary.categories.tests.tracked += 1;
      const lines = countLines(pathname);
      if (lines > policy.tests.maxLines) {
        summary.categories.tests.oversized += 1;
        summary.categories.tests.lines += lines;
        summary.violations.push({
          type: "test-lines",
          pathname,
          lines,
          limit: policy.tests.maxLines
        });
        summary.topOffenders.tests.push({ pathname, lines });
      }
    } else if (dataCandidate) {
      summary.categories.data.tracked += 1;
      if (policy.data.exemptFiles.includes(pathname)) continue;
      const approvedRoot = policy.data.approvedRoots.some((prefix) => pathname.startsWith(prefix));
      if (stat.size > policy.data.maxBytes && !approvedRoot) {
        summary.categories.data.oversized += 1;
        summary.categories.data.bytes += stat.size;
        summary.violations.push({
          type: "data-size",
          pathname,
          bytes: stat.size,
          limit: policy.data.maxBytes
        });
        summary.topOffenders.data.push({ pathname, bytes: stat.size });
      }
    } else {
      summary.categories.other.tracked += 1;
    }
  }

  summary.topOffenders.docs = sortAndTrim(summary.topOffenders.docs, "bytes");
  summary.topOffenders.source = sortAndTrim(summary.topOffenders.source, "lines");
  summary.topOffenders.tests = sortAndTrim(summary.topOffenders.tests, "lines");
  summary.topOffenders.data = sortAndTrim(summary.topOffenders.data, "bytes");
  summary.counts = {
    tracked:
      summary.categories.docs.tracked +
      summary.categories.source.tracked +
      summary.categories.tests.tracked +
      summary.categories.data.tracked +
      summary.categories.other.tracked,
    violations: summary.violations.length
  };
  summary.status = summary.violations.length ? "violation" : "ok";
  return summary;
}

export function buildBudgetRemediationHints(violations, policy = DEFAULT_POLICY) {
  const sourceMaxLines = policy.source?.maxLines ?? DEFAULT_POLICY.source.maxLines;
  const testMaxLines = policy.tests?.maxLines ?? DEFAULT_POLICY.tests.maxLines;
  const hints = [
    "Reference docs/operations/token-efficiency-commands.md for the standard scan/report commands.",
    "Check docs/backlog.md for the owning BL item and update the matching shard or worklog entry."
  ];
  const seen = new Set(hints);

  const add = (hint) => {
    if (!seen.has(hint)) {
      seen.add(hint);
      hints.push(hint);
    }
  };

  for (const violation of violations) {
    if (violation.type === "doc-size") {
      add(`Docs: split ${violation.pathname} into smaller topic shards or move historical notes under docs/backlog/ or docs/operations/cycles/evidence/.`);
    } else if (violation.type === "source-lines") {
      add(`Source: extract helpers/components from ${violation.pathname} so the file stays under ${sourceMaxLines} lines.`);
    } else if (violation.type === "test-lines") {
      add(`Tests: factor shared fixtures from ${violation.pathname} and split oversized suites so the file stays under ${testMaxLines} lines.`);
    } else if (violation.type === "data-size") {
      add(`Data: move generated blobs like ${violation.pathname} under an approved root such as var/ or prune stale artifacts before review.`);
    }
  }

  return hints;
}
