#!/usr/bin/env node

import path from "node:path";
import { buildBudgetRemediationHints, evaluateBudgetPolicy, loadEffectiveBudgetPolicy } from "./budget-policy.mjs";

function formatViolation(violation) {
  if (violation.type === "doc-size") {
    return `${violation.pathname} (${violation.bytes} bytes > ${violation.limit})`;
  }
  if (violation.type === "source-lines" || violation.type === "test-lines") {
    return `${violation.pathname} (${violation.lines} lines > ${violation.limit})`;
  }
  if (violation.type === "data-size") {
    return `${violation.pathname} (${violation.bytes} bytes > ${violation.limit})`;
  }
  return `${violation.pathname || "unknown"} (${violation.type || "violation"})`;
}

function printBlock(label, lines) {
  console.error(label);
  for (const line of lines) {
    console.error(`- ${line}`);
  }
}

const effective = loadEffectiveBudgetPolicy();
const report = evaluateBudgetPolicy(effective.policy);

if (!report.violations.length) {
  console.log("PASS: context budget within policy.");
  console.log(`Policy source: ${effective.source}`);
  console.log(`Policy file: ${path.relative(process.cwd(), effective.policyPath) || effective.policyPath}`);
  process.exit(0);
}

const hints = buildBudgetRemediationHints(report.violations, effective.policy);

console.error("FAIL: context budget violations detected.");
console.error(`Policy source: ${effective.source}`);
console.error(`Policy file: ${path.relative(process.cwd(), effective.policyPath) || effective.policyPath}`);
console.error("");

printBlock(
  "Violations",
  report.violations.map((violation) => `${violation.type}: ${formatViolation(violation)}`)
);

console.error("");
printBlock("Remediation hints", hints);
console.error("");
console.error("Ownership docs:");
console.error("- docs/backlog.md");
console.error("- docs/operations/token-efficiency-commands.md");

process.exitCode = 1;
