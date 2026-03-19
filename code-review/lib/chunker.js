/**
 * Splits large files into reviewable chunks at logical code boundaries.
 *
 * Files under the threshold are returned as a single chunk.
 * Files over the threshold are split at function/route boundaries
 * (never at arbitrary line numbers) so no function is split across chunks.
 *
 * Each chunk includes a header identifying the file, chunk number, and line range.
 */

// Files at or under this line count are sent as a single chunk
const SINGLE_CHUNK_THRESHOLD = 300;

// Target max lines per chunk for large files
const TARGET_CHUNK_LINES = 500;

// Patterns that indicate a logical split point (start of a new top-level declaration)
// These are matched against the beginning of a line (trimmed).
const SPLIT_BOUNDARY_PATTERNS = [
  /^export\s+async\s+function\s+/,
  /^export\s+function\s+/,
  /^export\s+const\s+\w+\s*=/,
  /^async\s+function\s+/,
  /^function\s+/,
  /^router\.(get|post|put|patch|delete|use)\s*\(/,
  /^app\.(get|post|put|patch|delete|use)\s*\(/,
  /^class\s+/,
  /^export\s+class\s+/,
  /^export\s+default\s+/,
];

/**
 * Returns true if this line marks the start of a logical code boundary.
 */
function isBoundaryLine(line) {
  const trimmed = line.trimStart();
  return SPLIT_BOUNDARY_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Splits an array of lines into chunks, each ending at a logical boundary.
 * Ensures no chunk exceeds TARGET_CHUNK_LINES * 1.5 lines (hard limit).
 */
function splitAtBoundaries(lines) {
  const chunks = [];
  let currentStart = 0;

  for (let i = 1; i < lines.length; i++) {
    const chunkSize = i - currentStart;

    if (chunkSize >= TARGET_CHUNK_LINES && isBoundaryLine(lines[i])) {
      chunks.push({ startLine: currentStart, endLine: i - 1, lines: lines.slice(currentStart, i) });
      currentStart = i;
    }

    // Hard cap: if a chunk is getting very large with no boundary found, cut it anyway
    if (chunkSize >= TARGET_CHUNK_LINES * 2) {
      chunks.push({ startLine: currentStart, endLine: i, lines: lines.slice(currentStart, i + 1) });
      currentStart = i + 1;
    }
  }

  // Last remaining chunk
  if (currentStart < lines.length) {
    chunks.push({
      startLine: currentStart,
      endLine: lines.length - 1,
      lines: lines.slice(currentStart),
    });
  }

  return chunks;
}

/**
 * Takes a file descriptor and returns an array of chunk strings ready for
 * inclusion in an API prompt. Each chunk includes a header comment.
 *
 * @param {object} fileDescriptor - { filePath, content, diff }
 * @returns {string[]} Array of chunk strings (may be a single element for small files)
 */
export function chunkFile(fileDescriptor) {
  const { filePath, content, diff } = fileDescriptor;
  const lines = content.split("\n");

  if (lines.length <= SINGLE_CHUNK_THRESHOLD) {
    // Return as a single chunk — no splitting needed
    const header = buildChunkHeader(filePath, 1, 1, 1, lines.length);
    return [header + content + (diff ? buildDiffSection(diff) : "")];
  }

  const rawChunks = splitAtBoundaries(lines);
  const total = rawChunks.length;

  return rawChunks.map((chunk, idx) => {
    const header = buildChunkHeader(
      filePath,
      idx + 1,
      total,
      chunk.startLine + 1,
      chunk.endLine + 1
    );
    const body = chunk.lines.join("\n");
    // Only attach the diff to the first chunk to avoid repeating it
    const diffSection = idx === 0 && diff ? buildDiffSection(diff) : "";
    return header + body + diffSection;
  });
}

function buildChunkHeader(filePath, chunkNum, totalChunks, startLine, endLine) {
  if (totalChunks === 1) {
    return (
      `${"=".repeat(72)}\n` +
      `FILE: ${filePath} (${endLine} lines)\n` +
      `${"=".repeat(72)}\n`
    );
  }
  return (
    `${"=".repeat(72)}\n` +
    `FILE: ${filePath} | CHUNK ${chunkNum} of ${totalChunks} | Lines ${startLine}-${endLine}\n` +
    `${"=".repeat(72)}\n`
  );
}

function buildDiffSection(diff) {
  return (
    `\n--- DIFF (changed lines in this file) ---\n` +
    diff +
    `\n--- END DIFF ---\n`
  );
}

/**
 * Batches an array of file descriptors into groups where each group's
 * total estimated character count stays under the per-call budget.
 *
 * @param {object[]} files - Array of { filePath, content, diff }
 * @param {number} charBudget - Max characters per batch (default ~200K chars ≈ ~50K tokens)
 * @returns {object[][]} Array of file arrays (batches)
 */
export function batchFiles(files, charBudget = 200_000) {
  const batches = [];
  let currentBatch = [];
  let currentSize = 0;

  for (const file of files) {
    const size = (file.content?.length ?? 0) + (file.diff?.length ?? 0);

    if (currentBatch.length > 0 && currentSize + size > charBudget) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }

    currentBatch.push(file);
    currentSize += size;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
