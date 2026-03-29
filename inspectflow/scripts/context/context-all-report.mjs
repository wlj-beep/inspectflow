#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const steps = [
  {
    label: "context:budget:report:compact",
    command: "npm",
    args: ["run", "context:budget:report:compact"]
  },
  {
    label: "context:shards:check:warn",
    command: "npm",
    args: ["run", "context:shards:check:warn"]
  },
  {
    label: "context:untracked:check",
    command: "npm",
    args: ["run", "context:untracked:check"]
  }
];

function runStep(step) {
  console.log(`\n==> ${step.label}`);
  console.log(`    $ ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    shell: false,
    env: process.env
  });
  if (result.error) {
    console.error(`    ! ${step.label} failed to start: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.error(`    ! ${step.label} exited with code ${result.status}`);
    return Number.isInteger(result.status) ? result.status : 1;
  }
  console.log(`    ✓ ${step.label} passed`);
  return 0;
}

for (const step of steps) {
  const status = runStep(step);
  if (status !== 0) process.exit(status);
}

console.log("\ncontext:all:report completed successfully.");
