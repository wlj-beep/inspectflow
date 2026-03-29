#!/usr/bin/env node

import { loadEffectiveBudgetPolicy } from "./budget-policy.mjs";

const effective = loadEffectiveBudgetPolicy();

process.stdout.write(`${JSON.stringify(effective, null, 2)}\n`);
