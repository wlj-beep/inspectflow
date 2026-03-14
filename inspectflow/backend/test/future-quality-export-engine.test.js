import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createExportCompatibilitySnapshot,
  createExportProfileEngine,
  renderFirstArticleExport,
  validateExportProfilePack
} from "../src/future/quality/exportProfileEngine.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(testDir, "fixtures", "future", "export");

function readJson(fileName) {
  return JSON.parse(readFileSync(path.join(fixtureDir, fileName), "utf8"));
}

describe("future quality export profile engine", () => {
  it("renders expected fixture output for as9102-basic profile", () => {
    const templates = readJson("templates.json");
    const profiles = readJson("profiles.json");
    const input = readJson("input.json");
    const expected = readJson("expected-as9102-basic.json");

    const engine = createExportProfileEngine({
      profiles,
      templates
    });

    const rendered = renderFirstArticleExport(engine, {
      profileId: "as9102-basic",
      input
    });

    expect({
      profileId: rendered.profileId,
      profileName: rendered.profileName,
      profileVersion: rendered.profileVersion,
      artifacts: rendered.artifacts
    }).toEqual(expected);
  });

  it("rejects profile references to missing templates", () => {
    expect(() =>
      createExportProfileEngine({
        profiles: [
          {
            id: "bad",
            name: "Bad",
            version: "0.1.0",
            templateIds: ["missing-template"]
          }
        ],
        templates: {}
      })
    ).toThrow(/missing template/);
  });

  it("validates export profile pack contracts", () => {
    const templates = readJson("templates.json");
    const profiles = readJson("profiles.json");

    const valid = validateExportProfilePack({ profiles, templates });
    expect(valid.ok).toBe(true);
    expect(valid.profileCount).toBe(2);
    expect(valid.templateCount).toBe(2);

    const invalid = validateExportProfilePack({
      profiles: [{ id: "bad profile id", name: "Bad", version: "v1", templateIds: ["missing"] }],
      templates: [{ id: "bad id", content: "" }]
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/must match/);
    expect(invalid.errors.join(" ")).toMatch(/missing template/);
  });

  it("generates deterministic compatibility snapshots", () => {
    const templates = readJson("templates.json");
    const profiles = readJson("profiles.json");
    const input = readJson("input.json");

    const engine = createExportProfileEngine({ profiles, templates });
    const rendered = renderFirstArticleExport(engine, {
      profileId: "as9102-basic",
      input,
      generatedAt: "2026-03-14T18:00:00.000Z"
    });

    const left = createExportCompatibilitySnapshot({
      fixtureId: "as9102-basic",
      profileId: rendered.profileId,
      profileVersion: rendered.profileVersion,
      artifacts: rendered.artifacts
    });
    const right = createExportCompatibilitySnapshot({
      fixtureId: "as9102-basic",
      profileId: rendered.profileId,
      profileVersion: rendered.profileVersion,
      artifacts: [...rendered.artifacts].reverse().reverse()
    });

    expect(left.contractId).toBe("QUAL-EXPORT-v1");
    expect(left.checksum).toBe(right.checksum);
  });
});
