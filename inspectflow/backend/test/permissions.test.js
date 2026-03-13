import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";

describe("Permissions and validation", () => {
  it("rejects record list without role", async () => {
    const res = await request(app).get("/api/records");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "missing_role" });
  });

  it("rejects part creation without manage_parts", async () => {
    const res = await request(app)
      .post("/api/parts")
      .set("x-user-role", "Operator")
      .send({ id: "TEST-001", description: "Test Part" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("requires OOT comment for record submission", async () => {
    const res = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId: "J-10042",
        partId: "1234",
        operationId: 1,
        lot: "Lot A",
        qty: 5,
        operatorUserId: 1,
        status: "complete",
        oot: true,
        values: [],
        tools: [],
        missingPieces: []
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "comment_required_for_oot" });
  });

  it("requires userId for operator unlock", async () => {
    const res = await request(app)
      .post("/api/jobs/J-10042/unlock")
      .set("x-user-role", "Operator")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "user_required" });
  });
});
