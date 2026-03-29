import { SAMPLING_OPTIONS } from "./domainConfig.js";
export function getSamplePieces(plan, qty, samplingInterval) {
  if (qty <= 0) return [];
  switch (plan) {
    case "first_last":
      return qty === 1 ? [1] : [1, qty];
    case "first_middle_last": {
      const middle = Math.floor((qty + 1) / 2);
      return Array.from(new Set([1, middle, qty])).sort((a, b) => a - b);
    }
    case "every_5": {
      const p = [];
      for (let i = 1; i <= qty; i += 5) p.push(i);
      if (p[p.length - 1] !== qty) p.push(qty);
      return p;
    }
    case "every_10": {
      const p = [];
      for (let i = 1; i <= qty; i += 10) p.push(i);
      if (p[p.length - 1] !== qty) p.push(qty);
      return p;
    }
    case "custom_interval": {
      const n = Math.max(1, Number(samplingInterval) || 1);
      const p = [];
      for (let i = 1; i <= qty; i += n) p.push(i);
      if (p[p.length - 1] !== qty) p.push(qty);
      return p;
    }
    default:
      return Array.from({ length: qty }, (_, i) => i + 1);
  }
}
export function samplingLabel(v, samplingInterval) {
  if (v === "custom_interval") {
    const n = Math.max(1, Number(samplingInterval) || 1);
    return `Every ${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
  }
  return SAMPLING_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function isOOT(value, tolPlus, tolMinus, nominal) {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value);
  if (s.includes("|")) {
    const [minStr, maxStr] = s.split("|");
    const minVal = parseFloat(minStr);
    const maxVal = parseFloat(maxStr);
    const hasMin = !isNaN(minVal);
    const hasMax = !isNaN(maxVal);
    if (!hasMin && !hasMax) return null;
    if (hasMin && minVal < nominal - tolMinus) return true;
    if (hasMax && maxVal > nominal + tolPlus) return true;
    return false;
  }
  const v = parseFloat(s);
  if (isNaN(v)) return null;
  return v > nominal + tolPlus || v < nominal - tolMinus;
}
export function formatValue(value, dim) {
  if (value === undefined || value === null || value === "") return "";
  const s = String(value);
  if (s.includes("|")) {
    const [minStr, maxStr] = s.split("|");
    const dec = dim?.unit === "Ra" ? 1 : 4;
    const fmt = (v) => (v === "" ? "" : isNaN(parseFloat(v)) ? v : parseFloat(v).toFixed(dec));
    const min = fmt(minStr || "");
    const max = fmt(maxStr || "");
    if (min && max) return `${min}–${max}`;
    return min || max || "";
  }
  if (s === "PASS" || s === "FAIL") return s;
  const dec = dim?.unit === "Ra" ? 1 : 4;
  const num = parseFloat(s);
  if (isNaN(num)) return s;
  return num.toFixed(dec);
}
export function splitRangeValue(value) {
  if (!value || !String(value).includes("|")) return ["", ""];
  const [minRaw, maxRaw] = String(value).split("|");
  return [minRaw || "", maxRaw || ""];
}
export function isValidNonNegativeNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}
export function parseFeatureModifiersInput(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[;,|]/)
    .map((token) => token.trim())
    .filter(Boolean);
}
export function formatCompactNumber(value, digits = 2) {
  if (value === undefined || value === null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(digits)).toString();
}
export function formatPercent(value, digits = 1) {
  if (value === undefined || value === null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
export function formatDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
export function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
export function rowsToCsv(headers, rows) {
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join(
    "\n"
  );
}
export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
export function fileToBase64Payload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.includes(",") ? text.slice(text.indexOf(",") + 1) : text);
    };
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}
export function inferAttachmentMediaType(fileName, fileType) {
  const type = String(fileType || "")
    .trim()
    .toLowerCase();
  if (type) return type;
  const name = String(fileName || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}
export function formatByteSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
export function flattenAnalyticsDimensions(parts) {
  return Object.values(parts || {}).flatMap((part) =>
    Object.entries(part.operations || {}).flatMap(([opKey, op]) =>
      (op.dimensions || []).map((dim) => ({
        id: dim.id,
        partNumber: part.partNumber,
        partDescription: part.description,
        operationKey: opKey,
        operationLabel: op.label,
        dimensionName: dim.name,
        nominal: dim.nominal,
        tolPlus: dim.tolPlus,
        tolMinus: dim.tolMinus,
        unit: dim.unit,
        label: `Part ${part.partNumber} · Op ${opKey} · ${dim.name}`
      }))
    )
  );
}
export function fmtSpec(dim) {
  const dec = dim.unit === "Ra" ? 1 : 4;
  const n = parseFloat(dim.nominal).toFixed(dec);
  const p = parseFloat(dim.tolPlus).toFixed(dec);
  const m = parseFloat(dim.tolMinus).toFixed(dec);
  return p === m ? `${n} \u00b1${p} ${dim.unit}` : `${n} +${p}/\u2212${m} ${dim.unit}`;
}
export function uid() {
  return Math.random().toString(36).slice(2, 8);
}
export function nowStr() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}
export function isToolSelectable(t) {
  if (!t) return false;
  return t.active !== false && t.visible !== false;
}

export function readUrlQueryParam(key, fallback = "") {
  if (typeof window === "undefined") return fallback;
  try {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function readUrlEnumParam(key, allowedValues, fallback) {
  const value = String(readUrlQueryParam(key, "")).trim();
  return allowedValues.includes(value) ? value : fallback;
}

export function readUrlIntParam(
  key,
  fallback,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}
) {
  const raw = String(readUrlQueryParam(key, "")).trim();
  if (!/^-?\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

export function writeUrlQueryParams(updates) {
  if (typeof window === "undefined" || !updates) return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const [key, rawValue] of Object.entries(updates)) {
      const nextValue = rawValue === undefined || rawValue === null ? "" : String(rawValue);
      const currentValue = url.searchParams.get(key);
      if (nextValue) {
        if (currentValue !== nextValue) {
          url.searchParams.set(key, nextValue);
          changed = true;
        }
      } else if (currentValue !== null) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const nextQuery = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextQuery ? `?${nextQuery}` : ""}${url.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  } catch {
    // Ignore URL sync failures and keep UI responsive.
  }
}

export function inferInstructionMediaType(url) {
  const value = String(url || "")
    .trim()
    .toLowerCase();
  if (!value) return "link";
  if (value.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/.test(value)) return "image";
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/.test(value)) return "video";
  return "link";
}

export function instructionLinkLabel(url, index) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return `Link ${index + 1}`;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.hostname ? parsed.hostname.replace(/^www\./, "") : `Link ${index + 1}`;
  } catch {
    return `Link ${index + 1}`;
  }
}

export function parseInstructionMediaLine(text, index) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  for (const separator of [" :: ", " | ", "\t"]) {
    const splitIndex = trimmed.indexOf(separator);
    if (splitIndex <= 0) continue;
    const label = trimmed.slice(0, splitIndex).trim();
    const url = trimmed.slice(splitIndex + separator.length).trim();
    if (!url) continue;
    return {
      label: label || instructionLinkLabel(url, index),
      url,
      type: inferInstructionMediaType(url)
    };
  }
  return {
    label: instructionLinkLabel(trimmed, index),
    url: trimmed,
    type: inferInstructionMediaType(trimmed)
  };
}

export function normalizeInstructionMediaLinks(raw) {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/\r?\n+/)
      : Array.isArray(raw?.items)
        ? raw.items
        : Array.isArray(raw?.links)
          ? raw.links
          : Array.isArray(raw?.mediaLinks)
            ? raw.mediaLinks
            : Array.isArray(raw?.media_links)
              ? raw.media_links
              : Array.isArray(raw?.mediaUrls)
                ? raw.mediaUrls
                : Array.isArray(raw?.media_urls)
                  ? raw.media_urls
                  : [];
  return items.flatMap((item, index) => {
    if (item === null || item === undefined) return [];
    if (typeof item === "string") {
      const parsed = parseInstructionMediaLine(item, index);
      return parsed ? [parsed] : [];
    }
    const url = String(
      item.url ?? item.href ?? item.link ?? item.mediaUrl ?? item.media_url ?? ""
    ).trim();
    if (!url) return [];
    return [
      {
        label:
          String(
            item.label ?? item.title ?? item.name ?? item.text ?? instructionLinkLabel(url, index)
          ).trim() || instructionLinkLabel(url, index),
        url,
        type:
          String(
            item.type ?? item.mediaType ?? item.media_type ?? inferInstructionMediaType(url)
          ).trim() || inferInstructionMediaType(url)
      }
    ];
  });
}

export function normalizeInstructionVersion(raw) {
  const mediaLinks = normalizeInstructionMediaLinks(raw);
  const versionLabel = String(
    raw?.versionLabel ??
      raw?.version_label ??
      raw?.version ??
      raw?.revision ??
      raw?.label ??
      raw?.name ??
      raw?.number ??
      ""
  ).trim();
  const status = String(raw?.status ?? raw?.state ?? "")
    .trim()
    .toLowerCase();
  const publishedAt = raw?.publishedAt ?? raw?.published_at ?? null;
  const acknowledgedAt = raw?.acknowledgedAt ?? raw?.acknowledged_at ?? null;
  return {
    id:
      raw?.id ??
      raw?.versionId ??
      raw?.version_id ??
      raw?.instructionVersionId ??
      raw?.instruction_version_id ??
      "",
    operationId: raw?.operationId ?? raw?.operation_id ?? null,
    versionLabel,
    title: String(raw?.title ?? raw?.name ?? raw?.heading ?? "").trim(),
    summary: String(raw?.summary ?? raw?.description ?? "").trim(),
    body: String(
      raw?.body ?? raw?.details ?? raw?.instructionText ?? raw?.instructions ?? raw?.workText ?? ""
    ).trim(),
    note: String(raw?.note ?? raw?.publishNote ?? raw?.publish_note ?? "").trim(),
    status: status || (publishedAt ? "published" : "draft"),
    publishedAt,
    createdAt: raw?.createdAt ?? raw?.created_at ?? null,
    createdByName: String(raw?.createdByName ?? raw?.created_by_name ?? "").trim(),
    createdByUserId: raw?.createdByUserId ?? raw?.created_by_user_id ?? null,
    acknowledged: Boolean(raw?.acknowledged ?? raw?.acknowledgedAt ?? raw?.acknowledged_at),
    acknowledgedAt,
    acknowledgedByUserId: raw?.acknowledgedByUserId ?? raw?.acknowledged_by_user_id ?? null,
    acknowledgedByName: String(raw?.acknowledgedByName ?? raw?.acknowledged_by_name ?? "").trim(),
    requiresAcknowledgment: raw?.requiresAcknowledgment ?? raw?.requires_acknowledgment ?? true,
    mediaLinks,
    mediaCount: mediaLinks.length,
    active: Boolean(
      raw?.active ??
      raw?.isActive ??
      raw?.is_active ??
      (status === "published" || status === "active")
    )
  };
}

export function normalizeInstructionVersionList(raw) {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.versions)
      ? raw.versions
      : Array.isArray(raw?.instructionVersions)
        ? raw.instructionVersions
        : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.data)
            ? raw.data
            : [];
  return rows
    .map(normalizeInstructionVersion)
    .filter((v) => v.id || v.title || v.summary || v.body);
}

export function normalizeActiveInstruction(raw, job) {
  const source =
    raw?.instructionVersion ??
    raw?.activeInstruction ??
    raw?.activeVersion ??
    raw?.version ??
    raw?.instruction ??
    raw;
  const version = normalizeInstructionVersion(source);
  const ack = raw?.acknowledgment ?? raw?.acknowledgement ?? raw?.ack ?? {};
  const acknowledged = Boolean(
    ack?.acknowledged ??
    ack?.acknowledgedAt ??
    ack?.acknowledged_at ??
    raw?.acknowledged ??
    raw?.acknowledgedAt ??
    raw?.acknowledged_at ??
    version.acknowledged
  );
  return {
    ...version,
    acknowledged,
    acknowledgedAt:
      ack?.acknowledgedAt ??
      ack?.acknowledged_at ??
      raw?.acknowledgedAt ??
      raw?.acknowledged_at ??
      version.acknowledgedAt ??
      null,
    acknowledgedByUserId:
      ack?.acknowledgedByUserId ??
      ack?.acknowledged_by_user_id ??
      raw?.acknowledgedByUserId ??
      raw?.acknowledged_by_user_id ??
      version.acknowledgedByUserId ??
      null,
    acknowledgedByName: String(
      ack?.acknowledgedByName ??
        ack?.acknowledged_by_name ??
        raw?.acknowledgedByName ??
        raw?.acknowledged_by_name ??
        version.acknowledgedByName ??
        ""
    ).trim(),
    requiresAcknowledgment:
      raw?.requiresAcknowledgment ??
      raw?.requires_acknowledgment ??
      version.requiresAcknowledgment ??
      true,
    jobNumber: job?.jobNumber ?? raw?.jobNumber ?? raw?.job_id ?? null,
    operationId: job?.operationId ?? job?.operation ?? version.operationId ?? null
  };
}

export function hasInstructionPayload(raw) {
  const candidate =
    raw?.instructionVersion ??
    raw?.activeInstruction ??
    raw?.activeVersion ??
    raw?.version ??
    raw?.instruction ??
    raw;
  if (!candidate || typeof candidate !== "object") return false;
  return Boolean(
    candidate.id ||
    candidate.title ||
    candidate.summary ||
    candidate.body ||
    candidate.versionLabel ||
    candidate.version ||
    candidate.mediaLinks ||
    candidate.media_links ||
    candidate.mediaUrls ||
    candidate.media_urls ||
    candidate.media ||
    candidate.status
  );
}
