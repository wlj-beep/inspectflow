#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const SCHEMA_PATH = path.join(REPO_ROOT, "backend/db/schema.sql");
const DOC_PATH = path.join(REPO_ROOT, "docs/data-model.md");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseSchemaTableNames(schemaText) {
  return [...schemaText.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]);
}

function parseDocumentedTableNames(docText) {
  return [...docText.matchAll(/^##\s+([a-z_][a-z0-9_]*)$/gim)].map((match) => match[1].toLowerCase());
}

const schemaText = readText(SCHEMA_PATH);
const docText = readText(DOC_PATH);
const coverageSection = docText.includes("## Schema Coverage Index")
  ? docText.slice(docText.indexOf("## Schema Coverage Index"))
  : docText;
const schemaTables = parseSchemaTableNames(schemaText);
const documentedTables = parseDocumentedTableNames(coverageSection);
const documentedSet = new Set(documentedTables);
const missingTables = schemaTables.filter((table) => !documentedSet.has(table));

const report = {
  generatedAt: new Date().toISOString(),
  schemaPath: path.relative(REPO_ROOT, SCHEMA_PATH),
  docPath: path.relative(REPO_ROOT, DOC_PATH),
  counts: {
    schemaTables: schemaTables.length,
    documentedTables: documentedTables.length,
    missingTables: missingTables.length
  },
  missingTables,
  status: missingTables.length ? "violation" : "ok"
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(missingTables.length ? 1 : 0);
