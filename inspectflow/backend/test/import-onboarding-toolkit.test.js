import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("Import onboarding toolkit", () => {
  it("exposes onboarding toolkit templates through the imports catalog", async () => {
    const res = await request(app)
      .get("/api/imports/templates")
      .set("x-user-role", "Admin");

    expect(res.status).toBe(200);
    expect(res.body.onboardingToolkit).toMatchObject({
      contractId: "INT-ONBOARD-v1"
    });
    expect(res.body.onboardingToolkit.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          importType: "jobs",
          templateKey: "jobs",
          sampleFile: "jobs-import-template.csv",
          requiredHeaders: expect.arrayContaining(["job_id", "part_id", "lot", "qty"])
        }),
        expect.objectContaining({
          importType: "part_dimensions",
          templateKey: "partDimensions"
        }),
        expect.objectContaining({
          importType: "measurements",
          templateKey: "measurements"
        })
      ])
    );
  });

  it("returns a customer-friendly ready dry-run report for valid onboarding csv", async () => {
    const res = await request(app)
      .post("/api/imports/onboarding/dry-run")
      .set("x-user-role", "Admin")
      .send({
        importType: "jobs",
        csvText: [
          "job_id,part_id,part_revision,op_number,lot,qty,status",
          "J-ONBOARD-1001,1234,A,020,Lot Ready,12,open"
        ].join("\n")
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      contractId: "INT-ONBOARD-v1",
      importType: "jobs",
      summary: {
        status: "ready",
        totalRows: 1,
        readyRows: 1,
        rowsNeedingAttention: 0,
        issueCount: 0
      },
      mappingTemplate: {
        label: "Jobs activation",
        sampleFile: "jobs-import-template.csv"
      }
    });
    expect(res.body.summary.customerMessage).toContain("ready for a live activation pass");
    expect(res.body.preflight.issues).toEqual([]);
    expect(res.body.nextSteps).toContain("Run the live import from the same template when the customer is ready.");
  });

  it("flags missing columns and row issues in onboarding dry-run previews", async () => {
    const res = await request(app)
      .post("/api/imports/onboarding/dry-run")
      .set("x-user-role", "Admin")
      .send({
        importType: "jobs",
        csvText: [
          "job_id,part_id,lot,qty",
          "J-ONBOARD-ERR,1234,Lot Draft,0"
        ].join("\n")
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      status: "needs_attention",
      totalRows: 1,
      readyRows: 0,
      rowsNeedingAttention: 1
    });
    expect(res.body.mappingPreview.missingRequiredHeaders).toEqual([]);
    expect(res.body.preflight.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "qty",
          error: "Quantity must be a positive whole number."
        }),
        expect.objectContaining({
          field: "op_number",
          error: "Provide either an operation number or operation ID for each job row."
        })
      ])
    );
    expect(res.body.summary.customerMessage).toContain("preflight issues");
  });
});
