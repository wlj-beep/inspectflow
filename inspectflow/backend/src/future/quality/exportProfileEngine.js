const PLACEHOLDER_PATTERN = /{{\s*([^}|]+?)\s*(?:\|\s*([a-zA-Z0-9_]+))?\s*}}/g;

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

  return {
    id,
    name,
    version,
    templateIds,
    defaults: isObject(profile.defaults) ? profile.defaults : {}
  };
}

export function createExportProfileEngine({ profiles, templates, formatters = {} }) {
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

export function renderFirstArticleExport(engine, { profileId, input, context = {} }) {
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
    generatedAt: new Date().toISOString(),
    artifacts
  };
}

export { DEFAULT_FORMATTERS };
