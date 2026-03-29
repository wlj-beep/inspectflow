import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function getTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

export function existsAndFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(readText(filePath));
}

export function countLines(text) {
  return text.length ? text.split("\n").length : 0;
}

export function countFileLines(filePath) {
  return countLines(readText(filePath));
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(2)} MiB`;
}

export function topLevelPrefix(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return path.extname(parts[0] || "") ? "(root)" : parts[0] || ".";
  return parts[0];
}

export function extensionOf(filePath) {
  if (filePath.endsWith(".tar.gz")) return ".tar.gz";
  const ext = path.extname(filePath);
  return ext || "(none)";
}

export function isDoc(pathname) {
  return pathname.endsWith(".md") || pathname.endsWith(".markdown") || pathname.endsWith(".rst") || pathname.endsWith(".txt");
}

export function isCode(pathname, prefixes = ["frontend/src/domains/jobflow/"]) {
  return prefixes.some((prefix) => pathname.startsWith(prefix)) && [".js", ".jsx", ".ts", ".tsx"].some((ext) => pathname.endsWith(ext));
}

export function isTest(pathname) {
  return (
    (pathname.startsWith("frontend/tests/") || pathname.startsWith("backend/test/")) &&
    [".js", ".jsx", ".ts", ".tsx"].some((ext) => pathname.endsWith(ext))
  );
}

