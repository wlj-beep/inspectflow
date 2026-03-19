/**
 * Aggregates the outputs from all three review agents into a single
 * structured markdown report. Handles partial failures gracefully —
 * if one agent errored, the report still includes the other two.
 */

/**
 * Builds the final markdown report.
 *
 * @param {object} opts
 * @param {string} opts.prNumber     - PR number (or "manual" for on-demand runs)
 * @param {string[]} opts.filePaths  - List of files that were reviewed
 * @param {object} opts.security     - { status: "fulfilled"|"rejected", value?, reason? }
 * @param {object} opts.quality      - Same shape as security
 * @param {object} opts.architecture - Same shape as security
 * @param {string} opts.tokenSummary - Token usage summary string from TokenTracker
 * @returns {string} Complete markdown report
 */
export function buildReport({ prNumber, filePaths, security, quality, architecture, tokenSummary }) {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const fileCount = filePaths.length;

  const lines = [];

  // Header
  lines.push(`# InspectFlow Code Review — PR #${prNumber}`);
  lines.push(`**Date**: ${timestamp} | **Files Reviewed**: ${fileCount}`);
  lines.push(`**Agents**: Security, Code Quality, Architecture`);
  lines.push("");

  // File list
  lines.push("## Files Reviewed");
  for (const fp of filePaths) {
    lines.push(`- \`${fp}\``);
  }
  lines.push("");

  // Executive summary table
  lines.push("## Executive Summary");
  lines.push("");

  const securityStats = extractStats(security);
  const qualityStats = extractStats(quality);
  const archStats = extractStats(architecture);

  lines.push("| Agent | Status | Findings | Critical | High | Medium | Low |");
  lines.push("|-------|--------|----------|----------|------|--------|-----|");
  lines.push(formatSummaryRow("Security", security.status, securityStats));
  lines.push(formatSummaryRow("Code Quality", quality.status, qualityStats));
  lines.push(formatSummaryRow("Architecture", architecture.status, archStats));
  lines.push("");

  const hasCritical = (securityStats.critical + qualityStats.critical + archStats.critical) > 0;
  const hasHigh = (securityStats.high + qualityStats.high + archStats.high) > 0;

  if (hasCritical) {
    lines.push("> **Critical findings require attention.**");
    lines.push("");
  } else if (hasHigh) {
    lines.push("> **High severity findings are present — review before merging.**");
    lines.push("");
  }

  // Individual agent sections
  lines.push("---");
  lines.push("");
  lines.push("## Security Review");
  lines.push("");
  lines.push(renderAgentOutput(security, "Security Agent"));
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Code Quality Review");
  lines.push("");
  lines.push(renderAgentOutput(quality, "Quality Agent"));
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Architecture Review");
  lines.push("");
  lines.push(renderAgentOutput(architecture, "Architecture Agent"));
  lines.push("");

  // Footer
  lines.push("---");
  lines.push("");
  lines.push("## Review Metadata");
  if (tokenSummary) {
    lines.push(`- ${tokenSummary}`);
  }
  lines.push(`- Model: claude-sonnet-4-6`);
  lines.push(`- Generated: ${timestamp}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Generates the report filename.
 */
export function buildReportFilename(prNumber) {
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "T")
    .replace("Z", "Z")
    .slice(0, 20);
  return `pr-${prNumber}-${ts}.md`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function renderAgentOutput(result, agentLabel) {
  if (result.status === "rejected") {
    return (
      `> **${agentLabel} encountered an error and could not complete the review.**\n` +
      `>\n` +
      `> Error: ${String(result.reason?.message ?? result.reason ?? "Unknown error")}`
    );
  }
  return result.value ?? "_No output returned._";
}

/**
 * Extracts severity counts from agent output text.
 * Looks for patterns like "**SEVERITY**: Critical" in the markdown output.
 */
function extractStats(result) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  if (result.status !== "fulfilled" || !result.value) return counts;

  const text = result.value;

  // Match lines like: - **SEVERITY**: Critical
  // or: **SEVERITY**: High
  const matches = text.matchAll(/\*\*SEVERITY\*\*\s*:\s*(Critical|High|Medium|Low)/gi);
  for (const match of matches) {
    const level = match[1].toLowerCase();
    if (level === "critical") counts.critical++;
    else if (level === "high") counts.high++;
    else if (level === "medium") counts.medium++;
    else if (level === "low") counts.low++;
  }

  return counts;
}

function formatSummaryRow(label, status, stats) {
  if (status === "rejected") {
    return `| ${label} | Error | — | — | — | — | — |`;
  }
  const total = stats.critical + stats.high + stats.medium + stats.low;
  return `| ${label} | Done | ${total} | ${stats.critical} | ${stats.high} | ${stats.medium} | ${stats.low} |`;
}
