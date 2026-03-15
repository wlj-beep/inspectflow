import { createExportProfileEngine, renderFirstArticleExport } from "../../future/quality/exportProfileEngine.js";

const STARTER_TEMPLATES = {
  "fai-summary-v1": {
    description: "Human-readable first article summary",
    content: "Part: {{part.id}}\nRevision: {{part.revision | upper}}\nLot: {{lot}}\nInspector: {{inspector.name}}\nMeasured: {{stats.measured}}\nPass Rate: {{stats.passRate | percent}}"
  },
  "fai-line-v1": {
    description: "Flat CSV-like row output",
    content: "{{part.id}},{{part.revision | upper}},{{lot}},{{stats.measured}},{{stats.failed}}"
  }
};

const STARTER_PROFILES = [
  {
    id: "as9102-basic",
    name: "AS9102 Basic",
    version: "0.1.0",
    templateIds: ["fai-summary-v1", "fai-line-v1"],
    defaults: {
      lot: "UNSPECIFIED"
    }
  },
  {
    id: "as9102-line-only",
    name: "AS9102 Line Only",
    version: "0.1.0",
    templateIds: ["fai-line-v1"]
  }
];

let engineCache = null;

function getAs9102Engine() {
  if (!engineCache) {
    engineCache = createExportProfileEngine({
      profiles: STARTER_PROFILES,
      templates: STARTER_TEMPLATES
    });
  }
  return engineCache;
}

export function listAs9102Profiles() {
  return STARTER_PROFILES.map((profile) => ({
    id: profile.id,
    name: profile.name,
    version: profile.version,
    templateIds: [...profile.templateIds]
  }));
}

export function renderAs9102Export({ profileId = "as9102-basic", input, generatedAt }) {
  const engine = getAs9102Engine();
  if (!engine.hasProfile(profileId)) {
    throw new Error("unknown_profile");
  }

  const rendered = renderFirstArticleExport(engine, {
    profileId,
    input,
    generatedAt
  });

  const profile = engine.getProfile(profileId);

  return {
    contractId: engine.contractId,
    exportContractId: engine.exportContractId,
    profile: {
      id: profile.id,
      name: profile.name,
      version: profile.version,
      templateIds: [...profile.templateIds]
    },
    output: {
      profileId: rendered.profileId,
      profileName: rendered.profileName,
      profileVersion: rendered.profileVersion,
      generatedAt: rendered.generatedAt,
      artifacts: rendered.artifacts
    }
  };
}

export const DEFAULT_AS9102_PROFILE_ID = "as9102-basic";
