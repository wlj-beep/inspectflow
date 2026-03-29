/**
 * Code Quality Review Agent
 *
 * Reviews source files for code quality issues: function complexity, duplication,
 * error handling gaps, magic values, dead code, and ES module consistency.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { batchFiles, chunkFile } from "../lib/chunker.js";
import { withRetry, TokenTracker } from "../lib/token-budget.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

function loadPrompt(name) {
  return readFileSync(join(PROMPTS_DIR, name), "utf8");
}

/**
 * Runs the code quality review agent against the provided files.
 *
 * @param {object[]} files - Array of { filePath, content, diff } descriptors
 * @param {TokenTracker} tracker - Shared token usage tracker
 * @returns {Promise<string>} Markdown-formatted quality review
 */
export async function runQualityAgent(files, tracker) {
  if (files.length === 0) {
    return "_No reviewable files in scope for quality review._";
  }

  const client = new Anthropic();
  const context = loadPrompt("context.md");
  const agentPrompt = loadPrompt("quality.md");

  const systemPrompt = `${agentPrompt}\n\n---\n\n# Project Context\n\n${context}`;

  const batches = batchFiles(files);
  const allOutputs = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchLabel = batches.length > 1
      ? ` (batch ${batchIdx + 1} of ${batches.length})`
      : "";

    let userContent = `Please review the following source files for code quality issues${batchLabel}.\n\n`;
    userContent += `Files in this review: ${batch.map((f) => f.filePath).join(", ")}\n`;

    for (const file of batch) {
      const chunks = chunkFile(file);
      for (const chunk of chunks) {
        userContent += "\n" + chunk;
      }
    }

    const response = await withRetry(
      () =>
        client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      `quality-agent batch ${batchIdx + 1}`
    );

    if (tracker) tracker.record(response.usage);

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    allOutputs.push(text);
  }

  return allOutputs.join("\n\n---\n\n");
}
