import { createExportProfileEngine, renderFirstArticleExport } from "../../future/quality/exportProfileEngine.js";

const STARTER_TEMPLATES = {
  "fai-summary-v1": {
    description: "Human-readable first article summary",
    content: "Part: {{part.id}}\nRevision: {{part.revision | upper}}\nLot: {{lot}}\nInspector: {{inspector.name}}\nMeasured: {{stats.measured}}\nPass Rate: {{stats.passRate | percent}}\nBalloon Summary: {{balloonSummary}}\nFixture Summary: {{fixtureSummary}}"
  },
  "fai-line-v1": {
    description: "Flat CSV-like row output",
    content: "{{part.id}},{{part.revision | upper}},{{lot}},{{stats.measured}},{{stats.failed}},{{balloonSummary}},{{fixtureSummary}}"
  },
  "fai-fixture-v1": {
    description: "Acceptance fixture details",
    content: "Fixtures: {{fixtureSummary}}"
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
  },
  {
    id: "as9102-fixture-pack",
    name: "AS9102 Fixture Pack",
    version: "0.1.0",
    templateIds: ["fai-summary-v1", "fai-fixture-v1"],
    defaults: {
      lot: "UNSPECIFIED"
    }
  }
];

let engineCache = null;

function buildPackageArtifact({ input, profile, generatedAt }) {
  if (!input?.package) return null;

  return {
    templateId: "fai-package-json-v1",
    description: "Structured AS9102 package payload",
    mediaType: "application/json",
    fileName: `as9102-${String(input.part?.id || "record").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase()}-${profile.id}.json`,
    generatedAt,
    content: JSON.stringify({
      contractId: input.package.contractId,
      profileId: profile.id,
      profileVersion: profile.version,
      package: input.package
    }, null, 2)
  };
}

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
      artifacts: [
        ...rendered.artifacts,
        ...(() => {
          const packageArtifact = buildPackageArtifact({
            input,
            profile,
            generatedAt: rendered.generatedAt
          });
          return packageArtifact ? [packageArtifact] : [];
        })()
      ]
    }
  };
}

export const DEFAULT_AS9102_PROFILE_ID = "as9102-basic";
