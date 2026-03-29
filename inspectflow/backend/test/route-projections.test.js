import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import {
  createTestSession,
  cleanupTestUsers
} from "./helpers/sessionFixtures.js";

const trackedToolIds = [];
const trackedLocationIds = [];
const trackedIntegrationIds = [];
const trackedUserIds = [];

function suffix() {
  return crypto.randomUUID().slice(0, 8);
}

afterEach(async () => {
  for (const id of trackedToolIds.splice(0).reverse()) {
    await query("DELETE FROM tools WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedLocationIds.splice(0).reverse()) {
    await query("DELETE FROM tool_locations WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedIntegrationIds.splice(0).reverse()) {
    await query("DELETE FROM import_integrations WHERE id=$1", [id]).catch(() => {});
  }
  await cleanupTestUsers(trackedUserIds);
});

describe("route projection regressions", () => {
  it("preserves explicit tool projections through create, list, and update", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const currentLocationName = `Proj Current ${suffix()}`;
    const homeLocationName = `Proj Home ${suffix()}`;
    const currentLocation = await query(
      "INSERT INTO tool_locations (name, location_type) VALUES ($1,$2) RETURNING id",
      [currentLocationName, "machine"]
    );
    const homeLocation = await query(
      "INSERT INTO tool_locations (name, location_type) VALUES ($1,$2) RETURNING id",
      [homeLocationName, "vendor"]
    );
    trackedLocationIds.push(Number(currentLocation.rows[0].id), Number(homeLocation.rows[0].id));

    const toolName = `Projection Tool ${suffix()}`;
    const createRes = await request(app)
      .post("/api/tools")
      .set("Cookie", admin.cookie)
      .send({
        name: toolName,
        type: "Variable",
        itNum: `IT-${suffix()}`,
        size: "M",
        calibrationDueDate: "2026-04-01",
        currentLocationId: trackedLocationIds[0],
        homeLocationId: trackedLocationIds[1],
        active: true,
        visible: true
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      name: toolName,
      current_location_name: currentLocationName,
      current_location_type: "machine",
      home_location_name: homeLocationName,
      home_location_type: "vendor"
    });
    trackedToolIds.push(Number(createRes.body.id));

    const listRes = await request(app)
      .get("/api/tools")
      .set("Cookie", admin.cookie);
    expect(listRes.status).toBe(200);
    const listed = listRes.body.find((tool) => Number(tool.id) === Number(createRes.body.id));
    expect(listed).toMatchObject({
      id: createRes.body.id,
      name: toolName,
      current_location_name: currentLocationName,
      home_location_name: homeLocationName
    });

    const updatedName = `Projection Tool Updated ${suffix()}`;
    const updateRes = await request(app)
      .put(`/api/tools/${createRes.body.id}`)
      .set("Cookie", admin.cookie)
      .send({ name: updatedName });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toMatchObject({
      id: createRes.body.id,
      name: updatedName,
      current_location_id: trackedLocationIds[0],
      home_location_id: trackedLocationIds[1],
      current_location_name: currentLocationName,
      home_location_name: homeLocationName
    });
  });

  it("preserves import integration fields when updating from the current-row projection", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const integrationName = `Projection Integration ${suffix()}`;
    const createRes = await request(app)
      .post("/api/imports/integrations")
      .set("Cookie", admin.cookie)
      .send({
        name: integrationName,
        sourceType: "api_pull",
        importType: "jobs",
        endpointUrl: "https://example.invalid/jobs",
        authHeader: "secret-token",
        pollIntervalMinutes: 15,
        enabled: false,
        options: { adapterPack: "erp_job_v1" }
      });

    expect(createRes.status).toBe(201);
    trackedIntegrationIds.push(Number(createRes.body.id));

    const updatedName = `Projection Integration Updated ${suffix()}`;
    const updateRes = await request(app)
      .put(`/api/imports/integrations/${createRes.body.id}`)
      .set("Cookie", admin.cookie)
      .send({ name: updatedName });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toMatchObject({
      id: createRes.body.id,
      name: updatedName,
      source_type: "api_pull",
      import_type: "jobs",
      endpoint_url: "https://example.invalid/jobs",
      auth_header: "secret-token",
      poll_interval_minutes: 15,
      enabled: false,
      options: { adapterPack: "erp_job_v1" }
    });
  });
});
