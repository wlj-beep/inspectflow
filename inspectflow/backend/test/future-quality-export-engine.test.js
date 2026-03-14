import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createExportProfileEngine,
  renderFirstArticleExport
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
});
