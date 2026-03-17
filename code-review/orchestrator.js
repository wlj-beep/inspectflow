/**
 * InspectFlow Code Review Orchestrator
 *
 * Entry point for the multi-agent code review system.
 * Runs the Security, Quality, and Architecture agents in parallel
 * against a set of changed files, then saves a consolidated report.
 *
 * Usage:
 *   node orchestrator.js incremental
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY  - Anthropic API key
 *   REPO_ROOT          - Absolute path to the repository root
 *   BASE_REF           - Base commit SHA for the diff (e.g. the PR base)
 *   HEAD_REF           - Head commit SHA for the diff (e.g. HEAD)
 *
 * Optional environment variables:
 *   PR_NUMBER          - PR number (used in report filename; defaults to "manual")
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { collectIncremental } from "./lib/file-collector.js";
import { buildReport, buildReportFilename } from "./lib/report-builder.js";
import { TokenTracker } from "./lib/token-budget.js";
import { runSecurityAgent } from "./agents/security-agent.js";
import { runQualityAgent } from "./agents/quality-agent.js";
import { runArchitectureAgent } from "./agents/architecture-agent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, "reports");

async function main() {
  const mode = process.argv[2] ?? "incremental";

  if (mode !== "incremental") {
    console.error(`[orchestrator] Unknown mode: "${mode}". Only "incremental" is supported.`);
    process.exit(1);
  }

  // Validate required environment variables
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[orchestrator] ANTHROPIC_API_KEY environment variable is required.");
    process.exit(1);
  }

  const repoRoot = process.env.REPO_ROOT;
  if (!repoRoot) {
    console.error("[orchestrator] REPO_ROOT environment variable is required.");
    process.exit(1);
  }

  const baseRef = process.env.BASE_REF;
  const headRef = process.env.HEAD_REF ?? "HEAD";
  if (!baseRef) {
    console.error("[orchestrator] BASE_REF environment variable is required.");
    process.exit(1);
  }

  const prNumber = process.env.PR_NUMBER ?? "manual";

  console.log(`[orchestrator] Mode: ${mode}`);
  console.log(`[orchestrator] Repo root: ${repoRoot}`);
  console.log(`[orchestrator] Diff range: ${baseRef}...${headRef}`);
  console.log(`[orchestrator] PR number: ${prNumber}`);
  console.log("");

  // Collect files to review
  let files;
  try {
    files = await collectIncremental(repoRoot, baseRef, headRef);
  } catch (err) {
    console.error(`[orchestrator] Failed to collect files: ${err.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log("[orchestrator] No reviewable files found. Nothing to review.");
    process.exit(0);
  }

  console.log(`[orchestrator] Reviewing ${files.length} file(s):`);
  for (const f of files) {
    console.log(`  - ${f.filePath}`);
  }
  console.log("");
  console.log("[orchestrator] Starting all three agents in parallel...");
  console.log("");

  const tracker = new TokenTracker();

  // Run all three agents concurrently — use allSettled so one failure
  // doesn't abort the others
  const [securityResult, qualityResult, architectureResult] = await Promise.allSettled([
    runSecurityAgent(files, tracker).then((v) => {
      console.log("[orchestrator] Security agent complete.");
      return v;
    }),
    runQualityAgent(files, tracker).then((v) => {
      console.log("[orchestrator] Quality agent complete.");
      return v;
    }),
    runArchitectureAgent(files, tracker).then((v) => {
      console.log("[orchestrator] Architecture agent complete.");
      return v;
    }),
  ]);

  console.log("");
  console.log(`[orchestrator] ${tracker.summary()}`);
  console.log("");

  // Build the consolidated report
  const filePaths = files.map((f) => f.filePath);
  const report = buildReport({
    prNumber,
    filePaths,
    security: securityResult,
    quality: qualityResult,
    architecture: architectureResult,
    tokenSummary: tracker.summary(),
  });

  // Save the report
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const filename = buildReportFilename(prNumber);
  const outputPath = join(REPORTS_DIR, filename);
  writeFileSync(outputPath, report, "utf8");

  console.log(`[orchestrator] Report saved to: ${outputPath}`);
  console.log("");

  // Log a summary of results
  const agentStatuses = [
    { name: "Security", result: securityResult },
    { name: "Quality", result: qualityResult },
    { name: "Architecture", result: architectureResult },
  ];

  let anyFailed = false;
  for (const { name, result } of agentStatuses) {
    if (result.status === "rejected") {
      console.error(`[orchestrator] ${name} agent FAILED: ${result.reason?.message ?? result.reason}`);
      anyFailed = true;
    } else {
      console.log(`[orchestrator] ${name} agent: OK`);
    }
  }

  if (anyFailed) {
    console.warn("\n[orchestrator] One or more agents failed. Partial report was saved.");
    // Exit 0 — the review is informational and should not block CI
  }

  console.log("\n[orchestrator] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[orchestrator] Unexpected fatal error:", err);
  process.exit(1);
});
