import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import "../src/routes/msa.js";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";
import { computeMsaSummary } from "../src/services/quality/msa.js";

const trackedStudyIds = [];
const trackedUserIds = [];

let qualityCookie = null;
let operatorUserIds = [];

beforeAll(async () => {
  const qualitySession = await createTestSession("Quality");
  qualityCookie = qualitySession.cookie;
  trackedUserIds.push(qualitySession.userId);

  const operatorOne = await createTestSession("Operator");
  const operatorTwo = await createTestSession("Operator");
  operatorUserIds = [operatorOne.userId, operatorTwo.userId];
  trackedUserIds.push(operatorOne.userId, operatorTwo.userId);
});

afterEach(async () => {
  for (const studyId of trackedStudyIds) {
    await query("DELETE FROM msa_studies WHERE id=$1", [studyId]).catch(() => {});
  }
  trackedStudyIds.length = 0;
});

afterAll(async () => {
  await cleanupTestUsers(trackedUserIds);
});

describe("MSA calculations", () => {
  it("computes the balanced ANOVA-like baseline deterministically", () => {
    const summary = computeMsaSummary(
      {
        partCount: 3,
        operatorUserIds: [11, 12],
        trialsPerPart: 2
      },
      [
        { partNumber: 1, operatorUserId: 11, trialNumber: 1, measurement: 10 },
        { partNumber: 1, operatorUserId: 11, trialNumber: 2, measurement: 10 },
        { partNumber: 1, operatorUserId: 12, trialNumber: 1, measurement: 10 },
        { partNumber: 1, operatorUserId: 12, trialNumber: 2, measurement: 10 },
        { partNumber: 2, operatorUserId: 11, trialNumber: 1, measurement: 20 },
        { partNumber: 2, operatorUserId: 11, trialNumber: 2, measurement: 20 },
        { partNumber: 2, operatorUserId: 12, trialNumber: 1, measurement: 20 },
        { partNumber: 2, operatorUserId: 12, trialNumber: 2, measurement: 20 },
        { partNumber: 3, operatorUserId: 11, trialNumber: 1, measurement: 30 },
        { partNumber: 3, operatorUserId: 11, trialNumber: 2, measurement: 30 },
        { partNumber: 3, operatorUserId: 12, trialNumber: 1, measurement: 30 },
        { partNumber: 3, operatorUserId: 12, trialNumber: 2, measurement: 30 }
      ]
    );

    expect(summary.error).toBeUndefined();
    expect(summary.design).toMatchObject({
      partCount: 3,
      operatorCount: 2,
      trialsPerPart: 2,
      observationCount: 12
    });
    expect(summary.means.grandMean).toBe(20);
    expect(summary.anova.repeatability.variance).toBe(0);
    expect(summary.anova.part.ms).toBe(400);
    expect(summary.capability.percentStudyVariation).toBe(0);
    expect(summary.verdict).toBe("pass");
  });
});

describe("MSA route contracts", () => {
  it("creates a study, records observations, computes summary, and lists persisted studies", async () => {
    const [operatorId, operator2Id] = operatorUserIds;
    expect(operatorId).toBeTruthy();
    expect(operator2Id).toBeTruthy();

    const created = await request(app)
      .post("/api/quality/msa/studies")
      .set("Cookie", qualityCookie)
      .send({
        title: "Gauge R&R baseline",
        partId: "1234",
        characteristicName: "Bore diameter",
        unit: "mm",
        lowerSpec: 9.8,
        upperSpec: 10.2,
        targetValue: 10,
        partCount: 3,
        operatorUserIds: [operatorId, operator2Id],
        trialsPerPart: 2,
        notes: "Baseline study for BL-117"
      });
    expect(created.status).toBe(201);
    expect(created.body.study).toMatchObject({
      title: "Gauge R&R baseline",
      partId: "1234",
      characteristicName: "Bore diameter",
      unit: "mm",
      partCount: 3,
      operatorCount: 2,
      verdict: null
    });
    trackedStudyIds.push(created.body.study.id);

    const batch = [];
    const measurements = [
      [1, 10],
      [2, 20],
      [3, 30]
    ];
    for (const [partNumber, value] of measurements) {
      batch.push(
        { partNumber, operatorUserId: operatorId, trialNumber: 1, measurement: value },
        { partNumber, operatorUserId: operatorId, trialNumber: 2, measurement: value },
        { partNumber, operatorUserId: operator2Id, trialNumber: 1, measurement: value },
        { partNumber, operatorUserId: operator2Id, trialNumber: 2, measurement: value }
      );
    }

    const recorded = await request(app)
      .post(`/api/quality/msa/studies/${created.body.study.id}/observations`)
      .set("Cookie", qualityCookie)
      .send({ observations: batch });
    expect(recorded.status).toBe(201);
    expect(recorded.body.observations).toHaveLength(12);

    const summary = await request(app)
      .get(`/api/quality/msa/studies/${created.body.study.id}/summary`)
      .set("Cookie", qualityCookie);
    expect(summary.status).toBe(200);
    expect(summary.body.summary.verdict).toBe("pass");
    expect(summary.body.summary.capability.percentStudyVariation).toBe(0);
    expect(summary.body.summary.anova.part.ms).toBe(400);

    const listed = await request(app)
      .get("/api/quality/msa/studies")
      .set("Cookie", qualityCookie);
    expect(listed.status).toBe(200);
    expect(listed.body.count).toBeGreaterThanOrEqual(1);
    expect(listed.body.studies.some((study) => study.id === created.body.study.id)).toBe(true);

    const detail = await request(app)
      .get(`/api/quality/msa/studies/${created.body.study.id}`)
      .set("Cookie", qualityCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.study.observationCount).toBe(12);
    expect(detail.body.observations).toHaveLength(12);
  });

  it("rejects incomplete study analysis until the balanced matrix is complete", async () => {
    const [operatorId, operator2Id] = operatorUserIds;

    const created = await request(app)
      .post("/api/quality/msa/studies")
      .set("Cookie", qualityCookie)
      .send({
        title: "Incomplete MSA",
        partId: "1234",
        characteristicName: "Bore diameter",
        unit: "mm",
        partCount: 2,
        operatorUserIds: [operatorId, operator2Id],
        trialsPerPart: 2
      });
    expect(created.status).toBe(201);
    trackedStudyIds.push(created.body.study.id);

    const recorded = await request(app)
      .post(`/api/quality/msa/studies/${created.body.study.id}/observations`)
      .set("Cookie", qualityCookie)
      .send({
        observations: [
          { partNumber: 1, operatorUserId: operatorId, trialNumber: 1, measurement: 10 }
        ]
      });
    expect(recorded.status).toBe(201);

    const summary = await request(app)
      .get(`/api/quality/msa/studies/${created.body.study.id}/summary`)
      .set("Cookie", qualityCookie);
    expect(summary.status).toBe(409);
    expect(summary.body.error).toBe("study_not_ready_for_analysis");
    expect(summary.body.missingCells).toBeDefined();
  });
});
