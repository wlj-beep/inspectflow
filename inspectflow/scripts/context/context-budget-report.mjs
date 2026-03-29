#!/usr/bin/env node

import { evaluateBudgetPolicy, loadEffectiveBudgetPolicy } from "./budget-policy.mjs";

function parseOutputMode(argv) {
  let mode = "pretty";
  for (const arg of argv) {
    if (arg === "--compact") {
      mode = "compact";
      continue;
    }
    if (arg === "--pretty") {
      mode = "pretty";
      continue;
    }
    if (arg.startsWith("--output=")) {
      const value = arg.slice("--output=".length).trim();
      if (value === "compact" || value === "pretty") {
        mode = value;
      }
    }
  }
  return mode;
}

const effective = loadEffectiveBudgetPolicy();
const summary = evaluateBudgetPolicy(effective.policy);

const report = {
  ...summary,
  source: effective.source,
  policyPath: effective.policyPath,
  policy: effective.policy,
  generatedAt: effective.generatedAt
};

const outputMode = parseOutputMode(process.argv.slice(2));
const json = outputMode === "compact" ? JSON.stringify(report) : JSON.stringify(report, null, 2);
console.log(json);
