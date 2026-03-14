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

function findMarkdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];

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

    tables.push({
      headers: parseTableRow(headerLine),
      rowLines: rows
    });
    i += rows.length + 1;
  }

  return tables;
}

function findFirstMarkdownTable(markdown) {
  return findMarkdownTables(markdown)[0] ?? null;
}

function collectBacklogIds(markdown) {
  const matches = markdown.match(/\bBL-\d{3}\b/g) ?? [];
  return new Set(matches);
}

function expandBlRange(startNumeric, endNumeric) {
  const start = Number.parseInt(startNumeric, 10);
  const end = Number.parseInt(endNumeric, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [];
  }

  const step = start <= end ? 1 : -1;
  const expanded = [];
  for (let current = start; step > 0 ? current <= end : current >= end; current += step) {
    expanded.push(`BL-${String(current).padStart(3, "0")}`);
  }
  return expanded;
}

function extractBlIdsFromText(text) {
  const ids = new Set();

  for (const match of text.matchAll(/BL-(\d{3})\s+through\s+BL-(\d{3})/gi)) {
    for (const id of expandBlRange(match[1], match[2])) {
      ids.add(id);
    }
  }

  for (const match of text.matchAll(/BL-(\d{3}(?:\/\d{3})+)/gi)) {
    const parts = match[1].split("/");
    for (const part of parts) {
      ids.add(`BL-${part}`);
    }
  }

  for (const match of text.matchAll(/\bBL-\d{3}\b/g)) {
    ids.add(match[0]);
  }

  return [...ids];
}

function buildBacklogDependencyMap(backlogContent, errors) {
  const dependencyMap = new Map();
  const tables = findMarkdownTables(backlogContent);

  for (const table of tables) {
    const headerIndex = new Map(table.headers.map((header, idx) => [header, idx]));
    if (!headerIndex.has("ID") || !headerIndex.has("Dependencies")) {
      continue;
    }

    for (const rowLine of table.rowLines) {
      const cells = parseTableRow(rowLine);
      if (cells.length !== table.headers.length) {
        continue;
      }

      const row = Object.fromEntries(table.headers.map((header, idx) => [header, cells[idx] ?? ""]));
      const itemId = row.ID;
      if (!ITEM_ID_PATTERN.test(itemId)) {
        continue;
      }

      if (dependencyMap.has(itemId)) {
        errors.push(`docs/backlog.md: duplicate dependency definition for \`${itemId}\`.`);
        continue;
      }

      const dependencyCell = row.Dependencies ?? "";
      const dependencyIds = extractBlIdsFromText(dependencyCell);
      dependencyMap.set(itemId, dependencyIds);
    }
  }

  return dependencyMap;
}

function collectCompletedIds(statusContent, worklogContent) {
  const completed = new Set();
  const completionLines = `${statusContent}\n${worklogContent}`
    .split(/\r?\n/)
    .filter((line) => /completed/i.test(line));

  for (const line of completionLines) {
    for (const itemId of extractBlIdsFromText(line)) {
      completed.add(itemId);
    }
  }

  return completed;
}

function hasAnyValue(rowObject) {
  return Object.values(rowObject).some((value) => value.length > 0);
}

async function main() {
  const root = process.cwd();
  const statusPath = path.join(root, "STATUS.md");
  const backlogPath = path.join(root, "docs", "backlog.md");
  const worklogPath = path.join(root, "WORKLOG.md");

  const [statusContent, backlogContent, worklogContent] = await Promise.all([
    readFile(statusPath, "utf8"),
    readFile(backlogPath, "utf8"),
    readFile(worklogPath, "utf8")
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
  const backlogDependencies = buildBacklogDependencyMap(backlogContent, errors);
  const completedIds = collectCompletedIds(statusContent, worklogContent);
  const activeRows = [];

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
      const workItem = row["Work Item"];

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

      if (ACTIVE_STATUSES.has(status)) {
        activeRows.push({ rowNumber, itemId, status, workItem });
      }
    });
  }

  for (const activeRow of activeRows) {
    if (!ITEM_ID_PATTERN.test(activeRow.itemId)) {
      continue;
    }

    const dependencies = backlogDependencies.get(activeRow.itemId) ?? [];
    for (const dependency of dependencies) {
      if (!backlogIds.has(dependency)) {
        errors.push(
          `docs/backlog.md: dependency \`${dependency}\` referenced by \`${activeRow.itemId}\` is not a valid backlog item.`
        );
      }
    }

    const unmetDependencies = dependencies.filter((dependency) => !completedIds.has(dependency));
    if (unmetDependencies.length === 0) {
      continue;
    }

    if (activeRow.status !== "Blocked") {
      errors.push(
        `STATUS.md row ${activeRow.rowNumber}: \`${activeRow.itemId}\` has unmet dependencies (${unmetDependencies.join(
          ", "
        )}) and must be \`Blocked\` until completion evidence exists.`
      );
      continue;
    }

    if (!/\bblocked by\b/i.test(activeRow.workItem)) {
      errors.push(
        `STATUS.md row ${activeRow.rowNumber}: Blocked item \`${activeRow.itemId}\` must include explicit \`Blocked by ...\` reason in Work Item text.`
      );
    }

    for (const dependency of unmetDependencies) {
      if (!activeRow.workItem.includes(dependency)) {
        errors.push(
          `STATUS.md row ${activeRow.rowNumber}: Blocked item \`${activeRow.itemId}\` must name unmet dependency \`${dependency}\` in Work Item text.`
        );
      }
    }
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
