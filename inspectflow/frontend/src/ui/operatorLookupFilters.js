function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function sortUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function extractOperatorLookupFacets(jobs) {
  const list = toArray(jobs);
  const parts = [];
  const operations = [];
  const statuses = [];

  for (const job of list) {
    if (!job) continue;
    parts.push(normalizeText(job.partNumber));
    operations.push(normalizeText(job.operation));
    statuses.push(normalizeText(job.status));
  }

  return {
    parts: sortUnique(parts),
    operations: sortUnique(operations),
    statuses: sortUnique(statuses)
  };
}

export function filterOperatorJobs(jobs, { search = "", part = "", operation = "", status = "" } = {}) {
  const list = toArray(jobs);
  const searchTerm = normalizeKey(search);
  const partTerm = normalizeKey(part);
  const operationTerm = normalizeKey(operation);
  const statusTerm = normalizeKey(status);

  return list.filter((job) => {
    if (!job) return false;

    const matchesPart = !partTerm || normalizeKey(job.partNumber) === partTerm;
    const matchesOperation = !operationTerm || normalizeKey(job.operation) === operationTerm;
    const matchesStatus = !statusTerm || normalizeKey(job.status) === statusTerm;

    if (!matchesPart || !matchesOperation || !matchesStatus) return false;

    if (!searchTerm) return true;

    const haystack = [
      job.jobNumber,
      job.lot,
      job.partNumber,
      job.operation
    ]
      .map(normalizeKey)
      .join(" ");

    return haystack.includes(searchTerm);
  });
}
