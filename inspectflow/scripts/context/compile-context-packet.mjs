#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAP_PATH = path.join(ROOT, "context", "retrieval-map.json");

function parseArgs(argv) {
  const out = {
    task: "",
    bl: "",
    signals: "",
    out: path.join(ROOT, "docs", "operations", "context-packet.latest.md"),
    validate: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--validate") {
      out.validate = true;
      continue;
    }
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function loadMap() {
  return JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function normalizeSignals({ task, bl, signals }) {
  return `${task} ${bl} ${signals}`
    .toLowerCase()
    .split(/[^a-z0-9\-]+/)
    .filter(Boolean);
}

function matchAny(signals, needles) {
  if (!needles?.length) {
    return false;
  }
  return needles.some((needle) => signals.some((s) => s.includes(needle)));
}

function dedupe(list) {
  return [...new Set(list)];
}

function validateMap(map) {
  const missing = [];
  const allPaths = [];

  allPaths.push(...(map.defaults?.tier1 || []));

  Object.values(map.specialists || {}).forEach((entry) => {
    if (entry.card) {
      allPaths.push(entry.card);
    }
  });

  (map.retrievalRules || []).forEach((rule) => {
    allPaths.push(...(rule.paths || []));
  });

  dedupe(allPaths).forEach((relPath) => {
    if (!fileExists(relPath)) {
      missing.push(relPath);
    }
  });

  if (missing.length) {
    console.error("Context map validation failed. Missing paths:");
    missing.forEach((p) => console.error(`- ${p}`));
    process.exit(1);
  }

  console.log("Context map validation passed.");
}

function buildPacket({ map, task, bl, signalsCsv }) {
  const signals = normalizeSignals({ task, bl, signals: signalsCsv });
  const selectedSpecialists = new Set(map.defaults.specialists || []);
  const tier3Paths = [];
  const matchedRuleIds = [];

  Object.entries(map.specialists || {}).forEach(([id, spec]) => {
    if (matchAny(signals, spec.triggers || [])) {
      selectedSpecialists.add(id);
    }
  });

  (map.retrievalRules || []).forEach((rule) => {
    if (matchAny(signals, rule.anySignals || [])) {
      matchedRuleIds.push(rule.id);
      tier3Paths.push(...(rule.paths || []));
    }
  });

  const tier1 = dedupe(map.defaults.tier1 || []);
  const specialists = dedupe([...selectedSpecialists]).map((id) => ({
    id,
    card: map.specialists[id]?.card || ""
  }));
  const tier3 = dedupe(tier3Paths);

  return { signals, tier1, specialists, tier3, matchedRuleIds };
}

function toMarkdown({ task, bl, packet }) {
  const now = new Date().toISOString();
  const lines = [];
  lines.push("# Context Packet");
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push(`Task: ${task || "(not provided)"}`);
  lines.push(`BL IDs: ${bl || "(not provided)"}`);
  lines.push(`Signals: ${packet.signals.join(", ") || "(none)"}`);
  lines.push("");
  lines.push("## Load Order");
  lines.push("1. Tier 1 constitution and core docs");
  lines.push("2. Tier 2 specialist cards");
  lines.push("3. Tier 3 task-scoped retrieval docs/code");
  lines.push("");
  lines.push("## Tier 1");
  packet.tier1.forEach((p) => lines.push(`- ${p}`));
  lines.push("");
  lines.push("## Tier 2");
  packet.specialists.forEach((s) => lines.push(`- ${s.id}: ${s.card}`));
  lines.push("");
  lines.push("## Tier 3");
  if (!packet.tier3.length) {
    lines.push("- (no rule matched; use Tier 1 + Tier 2 only)");
  } else {
    packet.tier3.forEach((p) => lines.push(`- ${p}`));
  }
  lines.push("");
  lines.push("## Rule Matches");
  if (!packet.matchedRuleIds.length) {
    lines.push("- (none)");
  } else {
    packet.matchedRuleIds.forEach((id) => lines.push(`- ${id}`));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  const map = loadMap();

  if (args.validate) {
    validateMap(map);
    return;
  }

  const packet = buildPacket({
    map,
    task: args.task || "",
    bl: args.bl || "",
    signalsCsv: args.signals || ""
  });

  const markdown = toMarkdown({
    task: args.task || "",
    bl: args.bl || "",
    packet
  });

  const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, "utf8");
  console.log(`Context packet written: ${path.relative(ROOT, outPath)}`);
}

main();
