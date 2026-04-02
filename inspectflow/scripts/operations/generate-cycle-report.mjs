#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, access, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";

const DISCOVERY_EXTENSIONS = new Set([".json", ".jsonl", ".ndjson", ".log", ".txt"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    const key = raw.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    if (args[key] === undefined) {
      args[key] = next;
    } else if (Array.isArray(args[key])) {
      args[key].push(next);
    } else {
      args[key] = [args[key], next];
    }
    i += 1;
  }
  return args;
}

function toArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseBlIds(input) {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseTrackList(input) {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function assertPathExists(targetPath, label = "Path") {
  try {
    await access(targetPath, constants.F_OK);
  } catch {
    throw new Error(`${label} not found: ${targetPath}`);
  }
}

async function validateRequiredArtifacts(paths) {
  const requiredArtifacts = paths.map((p) => path.resolve(String(p).trim())).filter(Boolean);
  for (const artifactPath of requiredArtifacts) {
    await assertPathExists(artifactPath, "Required artifact");
  }
  return requiredArtifacts;
}

function usageFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;

  const usage = obj.usage && typeof obj.usage === "object" ? obj.usage : obj;

  const promptTokens = asNumber(
    usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens,
    0
  );
  const completionTokens = asNumber(
    usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens,
    0
  );
  const totalTokens = asNumber(
    usage.total_tokens ?? usage.totalTokens,
    promptTokens + completionTokens
  );

  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return null;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cost: asNumber(usage.cost ?? usage.estimated_cost ?? usage.estimatedCost, 0)
  };
}

function collectUsageRecords(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.map(usageFromObject).filter(Boolean);
  }
  const single = usageFromObject(parsed);
  if (single) return [single];

  if (parsed && typeof parsed === "object") {
    const nestedArrays = Object.values(parsed).filter(Array.isArray);
    const flattened = nestedArrays.flat().map(usageFromObject).filter(Boolean);
    if (flattened.length) return flattened;
  }

  return [];
}

function extractUsageFromTextFallback(text) {
  const inputMatch = text.match(/(?:input_tokens|prompt_tokens|promptTokens|inputTokens)\s*[":= ]+\s*(\d+)/i);
  const outputMatch = text.match(/(?:output_tokens|completion_tokens|completionTokens|outputTokens)\s*[":= ]+\s*(\d+)/i);
  const totalMatch = text.match(/(?:total_tokens|totalTokens)\s*[":= ]+\s*(\d+)/i);
  const costMatch = text.match(/(?:estimated_cost|estimatedCost|cost)\s*[":= ]+\s*(\d+(?:\.\d+)?)/i);

  const promptTokens = inputMatch ? Number(inputMatch[1]) : 0;
  const completionTokens = outputMatch ? Number(outputMatch[1]) : 0;
  const totalTokens = totalMatch ? Number(totalMatch[1]) : promptTokens + completionTokens;

  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return [];
  }

  return [{
    promptTokens,
    completionTokens,
    totalTokens,
    cost: costMatch ? Number(costMatch[1]) : 0
  }];
}

function collectUsageFromTextLines(content) {
  const records = [];
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (!(line.startsWith("{") || line.startsWith("["))) {
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      records.push(...collectUsageRecords(parsed));
    } catch {
      // ignore non-JSON line
    }
  }

  return records;
}

async function parseUsageFile(filePath) {
  const content = await readFile(filePath, "utf8");

  try {
    const parsed = JSON.parse(content);
    const direct = collectUsageRecords(parsed);
    if (direct.length) {
      return direct;
    }
  } catch {
    // non-JSON content; try line-delimited JSON and fallback regex extraction
  }

  const lineRecords = collectUsageFromTextLines(content);
  if (lineRecords.length) {
    return lineRecords;
  }

  return extractUsageFromTextFallback(content);
}

async function walkDirectory(rootDir) {
  const files = [];
  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (DISCOVERY_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  await walk(rootDir);
  files.sort();
  return files;
}

async function discoverUsageFiles(dirs) {
  const discovered = [];
  for (const dir of dirs) {
    const abs = path.resolve(dir);
    const files = await walkDirectory(abs);
    discovered.push(...files);
  }
  return [...new Set(discovered)];
}

async function readUsageFiles({ explicitFiles, discoveredFiles }) {
  const allRecords = [];
  const usedSources = [];

  for (const filePath of explicitFiles) {
    const records = await parseUsageFile(filePath);
    if (!records.length) {
      throw new Error(`No usage tokens found in explicit file: ${filePath}`);
    }
    allRecords.push(...records);
    usedSources.push(filePath);
  }

  for (const filePath of discoveredFiles) {
    const records = await parseUsageFile(filePath);
    if (!records.length) {
      continue;
    }
    allRecords.push(...records);
    usedSources.push(filePath);
  }

  return {
    records: allRecords,
    usedSources
  };
}

function sumUsage(records) {
  return records.reduce(
    (acc, r) => ({
      promptTokens: acc.promptTokens + r.promptTokens,
      completionTokens: acc.completionTokens + r.completionTokens,
      totalTokens: acc.totalTokens + r.totalTokens,
      fileCost: acc.fileCost + (r.cost || 0)
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, fileCost: 0 }
  );
}

function formatCurrency(value) {
  return `$${value.toFixed(4)}`;
}

function buildReport({
  cycle,
  window,
  controller,
  blIds,
  tracks,
  gate,
  metrics,
  generatedAt,
  usageSources,
  requiredArtifacts
}) {
  const blLabel = blIds.length ? blIds.join(", ") : "BL-###";
  const tracksLabel = tracks.length ? tracks.join(", ") : "<track aliases>";
  const usageSection = usageSources.length
    ? usageSources.map((f) => `- \`${f}\``).join("\n")
    : "- None";
  const requiredArtifactsSection = requiredArtifacts.length
    ? requiredArtifacts.map((f) => `- \`${f}\``).join("\n")
    : "- None";

  return `# Multi-Agent Run Report — ${cycle}\n\n` +
    `Generated: ${generatedAt}\n\n` +
    `## Header\n` +
    `- \`Cycle\`: ${cycle}\n` +
    `- \`Window\`: ${window}\n` +
    `- \`Controller\`: ${controller}\n` +
    `- \`BL Scope\`: ${blLabel}\n` +
    `- \`Sub-Agents Active\`: ${tracksLabel}\n` +
    `- \`Overall Gate\`: ${gate}\n\n` +
    `## Token and Cost Metrics\n` +
    `- \`Controller Prompt Tokens\`: ${metrics.controllerPromptTokens}\n` +
    `- \`Sub-Agent Prompt Tokens (Total)\`: ${metrics.subAgentPromptTokens}\n` +
    `- \`Completion Tokens (Total)\`: ${metrics.completionTokens}\n` +
    `- \`Total Tokens\`: ${metrics.totalTokens}\n` +
    `- \`Estimated Cost\`: ${formatCurrency(metrics.estimatedCost)}\n` +
    `- \`Tokens per BL\`: ${metrics.tokensPerBl}\n` +
    `- \`Tokens per Accepted Change\`: ${metrics.tokensPerAcceptedChange}\n\n` +
    `## Usage Sources\n` +
    usageSection +
    `\n\n## Required Artifacts\n` +
    requiredArtifactsSection +
    `\n\n## Findings Table\n` +
    `| Cycle | Gate | Severity | BL IDs | Track | Evidence | Required Action | Due By | Block New Work (Y/N) |\n` +
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n` +
    `| ${cycle} | ${gate} | TBD | ${blLabel} | TBD | TBD | TBD | TBD | N |\n\n` +
    `## Gate Summary\n` +
    `- \`Green\`: no unresolved blocking findings.\n` +
    `- \`Yellow\`: mitigation required before closure.\n` +
    `- \`Red\`: stop new starts for impacted BL IDs until blocking rows are cleared.\n\n` +
    `## Sub-Agent Packet Links\n` +
    `- Link or embed one packet per active track using \`docs/operations/next-step-packet-template.md\`.\n`;
}

async function runSelfTest() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "inspectflow-cycle-report-"));
  try {
    const usageFile = path.join(tmpDir, "usage.json");
    const artifactFile = path.join(tmpDir, "evidence.txt");
    const outPath = path.join(tmpDir, "report.md");

    await writeFile(
      usageFile,
      JSON.stringify({ usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 } }, null, 2),
      "utf8"
    );
    await writeFile(artifactFile, "evidence\n", "utf8");

    const requiredArtifacts = await validateRequiredArtifacts([artifactFile]);
    const usageData = await readUsageFiles({ explicitFiles: [usageFile], discoveredFiles: [] });
    const report = buildReport({
      cycle: "2026-04-01-C8",
      window: "09:00-11:00 ET",
      controller: "codex-main",
      blIds: ["BL-115"],
      tracks: ["release"],
      gate: "Green",
      metrics: {
        controllerPromptTokens: 20,
        subAgentPromptTokens: 100,
        completionTokens: 30,
        totalTokens: 150,
        estimatedCost: 0.001,
        tokensPerBl: 150,
        tokensPerAcceptedChange: 150
      },
      generatedAt: "2026-04-01T12:00:00.000Z",
      usageSources: usageData.usedSources,
      requiredArtifacts
    });

    if (!report.includes("## Required Artifacts")) {
      throw new Error("Required artifacts section missing from generated report.");
    }

    await writeFile(outPath, report, "utf8");
    await validateRequiredArtifacts([artifactFile]);

    let missingArtifactFailed = false;
    try {
      await validateRequiredArtifacts([path.join(tmpDir, "missing.txt")]);
    } catch (error) {
      missingArtifactFailed = String(error.message).includes("Required artifact not found");
    }

    if (!missingArtifactFailed) {
      throw new Error("Missing required artifact did not fail as expected.");
    }

    console.log("Cycle report self-test passed.");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args["self-test"]) {
    await runSelfTest();
    return;
  }

  const cycle = String(args.cycle || "").trim();
  if (!cycle) {
    throw new Error("Missing required --cycle (example: 2026-03-31-C3)");
  }

  const explicitUsageFiles = toArray(args.usage).map((p) => path.resolve(String(p).trim())).filter(Boolean);
  const usageDirs = toArray(args.usageDir).map((p) => String(p).trim()).filter(Boolean);
  const requiredArtifacts = await validateRequiredArtifacts(toArray(args.requireArtifact));

  if (explicitUsageFiles.length === 0 && usageDirs.length === 0) {
    throw new Error("Provide --usage <file> and/or --usageDir <directory>");
  }

  const discoveredFiles = usageDirs.length ? await discoverUsageFiles(usageDirs) : [];
  const usageData = await readUsageFiles({ explicitFiles: explicitUsageFiles, discoveredFiles });

  if (usageData.records.length === 0) {
    throw new Error("No usage records found in provided usage files/directories");
  }

  const window = String(args.window || "<time window>").trim();
  const controller = String(args.controller || "<session alias>").trim();
  const gate = String(args.gate || "Yellow").trim();
  const blIds = parseBlIds(args.bl || "");
  const tracks = parseTrackList(args.tracks || "");

  const controllerPromptTokens = Math.max(0, Math.round(asNumber(args.controllerPromptTokens, 0)));
  const acceptedChanges = Math.max(0, Math.round(asNumber(args.acceptedChanges, 0)));
  const inRatePerMillion = asNumber(args.inputRatePerMillion, 0);
  const outRatePerMillion = asNumber(args.outputRatePerMillion, 0);

  const aggregate = sumUsage(usageData.records);

  const subAgentPromptTokens = Math.max(aggregate.promptTokens - controllerPromptTokens, 0);
  const estimatedCostFromRates =
    (aggregate.promptTokens / 1_000_000) * inRatePerMillion +
    (aggregate.completionTokens / 1_000_000) * outRatePerMillion;
  const estimatedCost = aggregate.fileCost > 0 ? aggregate.fileCost : estimatedCostFromRates;

  const tokensPerBl = blIds.length ? Math.round(aggregate.totalTokens / blIds.length) : 0;
  const tokensPerAcceptedChange = acceptedChanges > 0 ? Math.round(aggregate.totalTokens / acceptedChanges) : 0;

  const metrics = {
    controllerPromptTokens,
    subAgentPromptTokens,
    completionTokens: aggregate.completionTokens,
    totalTokens: aggregate.totalTokens,
    estimatedCost,
    tokensPerBl,
    tokensPerAcceptedChange
  };

  const generatedAt = new Date().toISOString();
  const outPath = path.resolve(String(
    args.out || path.join("docs", "operations", "cycles", `${cycle}-run-report.md`)
  ));

  await mkdir(path.dirname(outPath), { recursive: true });
  const report = buildReport({
    cycle,
    window,
    controller,
    blIds,
    tracks,
    gate,
    metrics,
    generatedAt,
    usageSources: usageData.usedSources,
    requiredArtifacts
  });

  await writeFile(outPath, report, "utf8");

  console.log("Cycle report generated:", outPath);
  console.log("Usage files scanned:", discoveredFiles.length + explicitUsageFiles.length);
  console.log("Usage sources with records:", usageData.usedSources.length);
  console.log("Total tokens:", aggregate.totalTokens);
  console.log("Estimated cost:", formatCurrency(estimatedCost));
}

main().catch((error) => {
  console.error("Failed to generate cycle report:", error.message);
  process.exit(1);
});
