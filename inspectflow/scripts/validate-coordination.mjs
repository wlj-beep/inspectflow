import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_COLUMNS = ["Rank", "Item ID", "Priority", "Status", "Owner", "Updated", "Work Item"];
const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const VALID_STATUSES = new Set(["Queued", "Claimed", "In Progress", "Blocked"]);
const ACTIVE_STATUSES = new Set(["Claimed", "In Progress", "Blocked"]);
const ITEM_ID_PATTERN = /^BL-\d{3}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseTableRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function findFirstMarkdownTable(markdown) {
  const lines = markdown.split(/\r?\n/);

  for (let i = 0; i < lines.length - 1; i += 1) {
    const headerLine = lines[i].trim();
    const separatorLine = lines[i + 1].trim();

    if (!headerLine.startsWith("|")) {
      continue;
    }

    if (!separatorLine.startsWith("|") || !separatorLine.includes("---")) {
      continue;
    }

    const rows = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const line = lines[j].trim();
      if (!line.startsWith("|")) {
        break;
      }
      rows.push(line);
    }

    return {
      headers: parseTableRow(headerLine),
      rowLines: rows
    };
  }

  return null;
}

function collectBacklogIds(markdown) {
  const matches = markdown.match(/\bBL-\d{3}\b/g) ?? [];
  return new Set(matches);
}

function hasAnyValue(rowObject) {
  return Object.values(rowObject).some((value) => value.length > 0);
}

async function main() {
  const root = process.cwd();
  const statusPath = path.join(root, "STATUS.md");
  const backlogPath = path.join(root, "docs", "backlog.md");

  const [statusContent, backlogContent] = await Promise.all([
    readFile(statusPath, "utf8"),
    readFile(backlogPath, "utf8")
  ]);

  const errors = [];
  const statusTable = findFirstMarkdownTable(statusContent);

  if (!statusTable) {
    errors.push("STATUS.md: no markdown table found for active queue.");
  }

  const backlogIds = collectBacklogIds(backlogContent);
  if (backlogIds.size === 0) {
    errors.push("docs/backlog.md: no backlog IDs found (expected BL-### entries).");
  }

  if (statusTable) {
    const { headers, rowLines } = statusTable;
    const headerIndex = new Map(headers.map((header, idx) => [header, idx]));

    for (const requiredColumn of REQUIRED_COLUMNS) {
      if (!headerIndex.has(requiredColumn)) {
        errors.push(`STATUS.md: missing required column \`${requiredColumn}\`.`);
      }
    }

    const seenRanks = new Set();
    const seenItemIds = new Set();

    rowLines.forEach((line, rowOffset) => {
      const cells = parseTableRow(line);
      const rowNumber = rowOffset + 1;

      if (cells.length !== headers.length) {
        errors.push(
          `STATUS.md row ${rowNumber}: column count mismatch (expected ${headers.length}, got ${cells.length}).`
        );
        return;
      }

      const row = Object.fromEntries(headers.map((header, idx) => [header, cells[idx] ?? ""]));
      if (!hasAnyValue(row)) {
        return;
      }

      const rank = row["Rank"];
      const itemId = row["Item ID"];
      const priority = row["Priority"];
      const status = row["Status"];
      const owner = row["Owner"];
      const updated = row["Updated"];

      if (!/^\d+$/.test(rank)) {
        errors.push(`STATUS.md row ${rowNumber}: Rank must be a positive integer.`);
      } else if (seenRanks.has(rank)) {
        errors.push(`STATUS.md row ${rowNumber}: duplicate Rank \`${rank}\`.`);
      } else {
        seenRanks.add(rank);
      }

      if (!ITEM_ID_PATTERN.test(itemId)) {
        errors.push(`STATUS.md row ${rowNumber}: Item ID must match BL-###.`);
      } else if (seenItemIds.has(itemId)) {
        errors.push(`STATUS.md row ${rowNumber}: duplicate Item ID \`${itemId}\`.`);
      } else {
        seenItemIds.add(itemId);
      }

      if (!VALID_PRIORITIES.has(priority)) {
        errors.push(`STATUS.md row ${rowNumber}: invalid Priority \`${priority}\`.`);
      }

      if (!VALID_STATUSES.has(status)) {
        errors.push(`STATUS.md row ${rowNumber}: invalid Status \`${status}\`.`);
      }

      if (ACTIVE_STATUSES.has(status) && owner.length === 0) {
        errors.push(`STATUS.md row ${rowNumber}: Owner is required when Status is \`${status}\`.`);
      }

      if (!ISO_TIMESTAMP_PATTERN.test(updated)) {
        errors.push(
          `STATUS.md row ${rowNumber}: Updated must be ISO-8601 with timezone (for example 2026-03-13T09:00:00-04:00).`
        );
      }

      if (ITEM_ID_PATTERN.test(itemId) && !backlogIds.has(itemId)) {
        errors.push(`STATUS.md row ${rowNumber}: Item ID \`${itemId}\` not found in docs/backlog.md.`);
      }
    });
  }

  if (errors.length > 0) {
    console.error("Coordination validation failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Coordination validation passed.");
}

main().catch((error) => {
  console.error("Coordination validation failed with an unexpected error:");
  console.error(error);
  process.exit(1);
});
