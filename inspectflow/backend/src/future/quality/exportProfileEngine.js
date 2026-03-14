import crypto from "node:crypto";

const PLACEHOLDER_PATTERN = /{{\s*([^}|]+?)\s*(?:\|\s*([a-zA-Z0-9_]+))?\s*}}/g;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const DEFAULT_FORMATTERS = {
  upper: (value) => String(value ?? "").toUpperCase(),
  lower: (value) => String(value ?? "").toLowerCase(),
  iso_date: (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  },
  number: (value) => (typeof value === "number" && Number.isFinite(value) ? String(value) : ""),
  percent: (value) => (typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "")
};

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getByPath(target, path) {
  return path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), target);
}

export function compileTemplate(templateContent, formatters = DEFAULT_FORMATTERS) {
  if (typeof templateContent !== "string" || !templateContent.length) {
    throw new Error("template content is required");
  }

  return (context) =>
    templateContent.replace(PLACEHOLDER_PATTERN, (_, pathExpr, formatterName) => {
      const rawValue = getByPath(context, pathExpr.trim());
      if (!formatterName) {
        return rawValue == null ? "" : String(rawValue);
      }

      const formatter = formatters[formatterName];
      if (!formatter) {
        throw new Error(`unknown formatter: ${formatterName}`);
      }

      return formatter(rawValue, context);
    });
}

function normalizeTemplateEntries(templateEntries) {
  if (Array.isArray(templateEntries)) {
    return templateEntries;
  }

  if (isObject(templateEntries)) {
    return Object.entries(templateEntries).map(([id, template]) => ({
      id,
      ...(isObject(template) ? template : { content: String(template) })
    }));
  }

  throw new Error("templates must be an array or object map");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function createTemplateRegistry(templateEntries, formatters = DEFAULT_FORMATTERS) {
  const templates = normalizeTemplateEntries(templateEntries);
  const registry = new Map();

  for (const template of templates) {
    if (!template || typeof template !== "object") {
      throw new Error("template entry must be an object");
    }

    const id = String(template.id ?? "").trim();
    if (!id) {
      throw new Error("template id is required");
    }

    if (registry.has(id)) {
      throw new Error(`duplicate template id: ${id}`);
    }

    const content = String(template.content ?? "");
    registry.set(id, {
      id,
      description: String(template.description ?? ""),
      content,
      render: compileTemplate(content, formatters)
    });
  }

  return {
    has: (templateId) => registry.has(templateId),
    get: (templateId) => registry.get(templateId),
    ids: () => Array.from(registry.keys())
  };
}

function normalizeProfile(profile) {
  const id = String(profile?.id ?? "").trim();
  const name = String(profile?.name ?? "").trim();
  const version = String(profile?.version ?? "0.0.0").trim();
  const templateIds = Array.isArray(profile?.templateIds)
    ? profile.templateIds.map((templateId) => String(templateId).trim()).filter(Boolean)
    : [];

  if (!id || !name || templateIds.length === 0) {
    throw new Error("profile requires id, name, and templateIds");
  }
  if (!ID_PATTERN.test(id)) {
    throw new Error(`profile id must match ${ID_PATTERN}`);
  }
  if (!VERSION_PATTERN.test(version)) {
    throw new Error("profile version must match MAJOR.MINOR.PATCH");
  }

  return {
    id,
    name,
    version,
    templateIds,
    defaults: isObject(profile.defaults) ? profile.defaults : {}
  };
}

export function validateExportProfilePack({ profiles = [], templates = {} }) {
  const errors = [];
  let templateEntries = [];

  try {
    templateEntries = normalizeTemplateEntries(templates);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const templateIds = new Set();
  for (const template of templateEntries) {
    const id = String(template?.id ?? "").trim();
    const content = String(template?.content ?? "");

    if (!id) {
      errors.push("template id is required");
      continue;
    }
    if (!ID_PATTERN.test(id)) {
      errors.push(`template id must match ${ID_PATTERN}: ${id}`);
    }
    if (templateIds.has(id)) {
      errors.push(`duplicate template id: ${id}`);
    }
    templateIds.add(id);

    if (!content.trim()) {
      errors.push(`template ${id} content is required`);
    }
  }

  const profileIds = new Set();
  for (const profile of profiles) {
    const id = String(profile?.id ?? "").trim();
    const version = String(profile?.version ?? "").trim();
    const name = String(profile?.name ?? "").trim();
    const refs = Array.isArray(profile?.templateIds) ? profile.templateIds : [];

    if (!id || !name) {
      errors.push("profile requires id and name");
      continue;
    }
    if (!ID_PATTERN.test(id)) {
      errors.push(`profile id must match ${ID_PATTERN}: ${id}`);
    }
    if (!VERSION_PATTERN.test(version)) {
      errors.push(`profile ${id} version must match MAJOR.MINOR.PATCH`);
    }
    if (profileIds.has(id)) {
      errors.push(`duplicate profile id: ${id}`);
    }
    profileIds.add(id);

    if (refs.length === 0) {
      errors.push(`profile ${id} must reference at least one template`);
      continue;
    }

    for (const templateId of refs) {
      const normalized = String(templateId ?? "").trim();
      if (!templateIds.has(normalized)) {
        errors.push(`profile ${id} references missing template ${normalized}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    contractId: "QUAL-FAI-v2",
    exportContractId: "QUAL-EXPORT-v1",
    profileCount: profileIds.size,
    templateCount: templateIds.size
  };
}

export function createExportProfileEngine({ profiles, templates, formatters = {} }) {
  const validation = validateExportProfilePack({ profiles, templates });
  if (!validation.ok) {
    throw new Error(`invalid export profile pack: ${validation.errors.join("; ")}`);
  }

  const formatterRegistry = {
    ...DEFAULT_FORMATTERS,
    ...formatters
  };

  const templateRegistry = createTemplateRegistry(templates, formatterRegistry);
  const profileMap = new Map();

  for (const profileInput of profiles ?? []) {
    const profile = normalizeProfile(profileInput);

    if (profileMap.has(profile.id)) {
      throw new Error(`duplicate profile id: ${profile.id}`);
    }

    for (const templateId of profile.templateIds) {
      if (!templateRegistry.has(templateId)) {
        throw new Error(`profile ${profile.id} references missing template ${templateId}`);
      }
    }

    profileMap.set(profile.id, profile);
  }

  return {
    contractId: "QUAL-FAI-v2",
    exportContractId: "QUAL-EXPORT-v1",
    templateRegistry,
    hasProfile: (profileId) => profileMap.has(profileId),
    getProfile: (profileId) => profileMap.get(profileId),
    listProfiles: () => Array.from(profileMap.values())
  };
}

export function renderFirstArticleExport(engine, { profileId, input, context = {}, generatedAt }) {
  if (!engine?.hasProfile || !engine?.templateRegistry) {
    throw new Error("invalid export profile engine instance");
  }

  const profile = engine.getProfile(profileId);
  if (!profile) {
    throw new Error(`unknown export profile: ${profileId}`);
  }

  const renderContext = {
    ...profile.defaults,
    ...input,
    context
  };

  const artifacts = profile.templateIds.map((templateId) => {
    const template = engine.templateRegistry.get(templateId);
    return {
      templateId,
      content: template.render(renderContext)
    };
  });

  return {
    profileId: profile.id,
    profileName: profile.name,
    profileVersion: profile.version,
    generatedAt: generatedAt ?? new Date().toISOString(),
    artifacts
  };
}

export function createExportCompatibilitySnapshot({ profileId, profileVersion, artifacts, fixtureId = "default" }) {
  const snapshot = {
    contractId: "QUAL-EXPORT-v1",
    fixtureId,
    profileId,
    profileVersion,
    artifacts: Array.isArray(artifacts)
      ? artifacts.map((artifact) => ({
          templateId: artifact.templateId,
          content: String(artifact.content ?? "")
        }))
      : []
  };

  const checksum = crypto.createHash("sha256").update(stableStringify(snapshot)).digest("hex");
  return {
    ...snapshot,
    checksum
  };
}

export { DEFAULT_FORMATTERS };
