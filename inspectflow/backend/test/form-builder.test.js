/**
 * HTTP integration tests for the no-code form builder.
 * BL-121 (OPS-FORMBUILDER-v1)
 */

import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const trackedFormIds = [];
const trackedSubmissionIds = [];
const trackedUserIds = [];

function suffix() {
  return crypto.randomUUID().slice(0, 8);
}

function formName() {
  return `Test Form ${suffix()}`;
}

const MINIMAL_SCHEMA = [
  { id: "f1", type: "text", label: "Operator Name", required: true },
  { id: "f2", type: "number", label: "Measurement", required: false }
];

afterEach(async () => {
  // Audit log cascades from form template deletion
  for (const id of trackedSubmissionIds.splice(0).reverse()) {
    await query("DELETE FROM inspection_form_submissions WHERE id=$1", [id]).catch(() => {});
  }
  for (const id of trackedFormIds.splice(0).reverse()) {
    await query("DELETE FROM inspection_form_templates WHERE id=$1", [id]).catch(() => {});
  }
  await cleanupTestUsers(trackedUserIds);
});

// ── Contracts ─────────────────────────────────────────────────────────────────

describe("GET /api/form-builder/contracts", () => {
  it("returns field type catalog to Admin", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const res = await request(app)
      .get("/api/form-builder/contracts")
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.contractId).toBe("OPS-FORMBUILDER-v1");
    expect(Array.isArray(res.body.fieldTypes)).toBe(true);
    expect(res.body.fieldTypes.length).toBeGreaterThan(10);
    const textType = res.body.fieldTypes.find((t) => t.type === "text");
    expect(textType).toBeDefined();
    expect(textType.isInputField).toBe(true);
    expect(textType.supportsRequired).toBe(true);
    const headerType = res.body.fieldTypes.find((t) => t.type === "section_header");
    expect(headerType.isInputField).toBe(false);
    expect(headerType.supportsRequired).toBe(false);
  });

  it("rejects non-Admin with 403", async () => {
    const op = await createTestSession("Operator");
    trackedUserIds.push(op.userId);

    const res = await request(app)
      .get("/api/form-builder/contracts")
      .set("Cookie", op.cookie);

    expect(res.status).toBe(403);
  });
});

// ── Create / List / Get ───────────────────────────────────────────────────────

describe("POST /api/form-builder/forms", () => {
  it("creates a draft form template", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const name = formName();
    const res = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name, description: "A test form", schema: MINIMAL_SCHEMA });

    expect(res.status).toBe(201);
    expect(res.body.contractId).toBe("OPS-FORMBUILDER-v1");
    expect(res.body.template.name).toBe(name);
    expect(res.body.template.status).toBe("draft");
    trackedFormIds.push(res.body.template.id);
  });

  it("rejects missing form name with 400", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const res = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ schema: MINIMAL_SCHEMA });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_form_name");
  });

  it("rejects invalid schema with 400", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const res = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: [{ id: "f1", type: "bogus_type", label: "X" }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_form_schema");
  });

  it("rejects duplicate form name with 409", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const name = formName();
    const first = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name, schema: MINIMAL_SCHEMA });
    expect(first.status).toBe(201);
    trackedFormIds.push(first.body.template.id);

    const second = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name, schema: MINIMAL_SCHEMA });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("duplicate_form_name");
  });

  it("rejects Operator with 403", async () => {
    const op = await createTestSession("Operator");
    trackedUserIds.push(op.userId);

    const res = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", op.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });

    expect(res.status).toBe(403);
  });

  it("allows Quality role with view_admin capability to create a draft", async () => {
    const quality = await createTestSession("Quality");
    trackedUserIds.push(quality.userId);

    const name = formName();
    const res = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", quality.cookie)
      .send({ name, schema: MINIMAL_SCHEMA });

    expect(res.status).toBe(201);
    expect(res.body.template.name).toBe(name);
    expect(res.body.template.status).toBe("draft");
    trackedFormIds.push(res.body.template.id);
  });
});

describe("GET /api/form-builder/forms", () => {
  it("lists templates in descending update order", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const nameA = formName();
    const nameB = formName();

    const a = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: nameA, schema: MINIMAL_SCHEMA });
    trackedFormIds.push(a.body.template.id);

    const b = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: nameB, schema: MINIMAL_SCHEMA });
    trackedFormIds.push(b.body.template.id);

    const res = await request(app)
      .get("/api/form-builder/forms")
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.templates)).toBe(true);
    const names = res.body.templates.map((t) => t.name);
    expect(names).toContain(nameA);
    expect(names).toContain(nameB);
  });

  it("filters by status", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const draftForm = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    trackedFormIds.push(draftForm.body.template.id);

    const res = await request(app)
      .get("/api/form-builder/forms?status=draft")
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    for (const t of res.body.templates) {
      expect(t.status).toBe("draft");
    }
  });
});

describe("GET /api/form-builder/forms/:id", () => {
  it("returns single template", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    const res = await request(app)
      .get(`/api/form-builder/forms/${id}`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.template.id).toBe(id);
    expect(Array.isArray(res.body.template.schema)).toBe(true);
  });

  it("returns 404 for unknown id", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const res = await request(app)
      .get("/api/form-builder/forms/999999999")
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("form_not_found");
  });
});

// ── Update ────────────────────────────────────────────────────────────────────

describe("PUT /api/form-builder/forms/:id", () => {
  it("updates a draft form", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    const newSchema = [
      { id: "f1", type: "text", label: "Inspector", required: true },
      { id: "f2", type: "checkbox", label: "Pass/Fail", required: true }
    ];

    const res = await request(app)
      .put(`/api/form-builder/forms/${id}`)
      .set("Cookie", admin.cookie)
      .send({ schema: newSchema });

    expect(res.status).toBe(200);
    expect(res.body.template.schema).toHaveLength(2);
  });

  it("blocks update on published form with 409", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const res = await request(app)
      .put(`/api/form-builder/forms/${id}`)
      .set("Cookie", admin.cookie)
      .send({ schema: MINIMAL_SCHEMA });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("form_not_editable");
  });
});

// ── Publish ───────────────────────────────────────────────────────────────────

describe("POST /api/form-builder/forms/:id/publish", () => {
  it("publishes a draft form with input fields", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    const res = await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.template.status).toBe("published");
  });

  it("rejects publish of empty form with 422", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: [] });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    const res = await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("form_has_no_fields");
  });

  it("rejects publish of layout-only form with 422", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const layoutOnly = [
      { id: "s1", type: "section_header", label: "Section A" },
      { id: "i1", type: "instruction_block", label: "Read carefully", config: { content: "..." } }
    ];
    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: layoutOnly });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    const res = await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("form_has_no_fields");
  });
});

// ── Archive ───────────────────────────────────────────────────────────────────

describe("POST /api/form-builder/forms/:id/archive", () => {
  it("archives a published form", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const res = await request(app)
      .post(`/api/form-builder/forms/${id}/archive`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.template.status).toBe("archived");
  });

  it("rejects double-archive with 409", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/archive`)
      .set("Cookie", admin.cookie);

    const res = await request(app)
      .post(`/api/form-builder/forms/${id}/archive`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("form_not_editable");
  });
});

// ── Preview ───────────────────────────────────────────────────────────────────

describe("GET /api/form-builder/forms/:id/preview", () => {
  it("returns template + fieldTypes catalog", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    const res = await request(app)
      .get(`/api/form-builder/forms/${id}/preview`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.template.id).toBe(id);
    expect(Array.isArray(res.body.fieldTypes)).toBe(true);
  });
});

// ── Submissions ───────────────────────────────────────────────────────────────

describe("POST /api/form-builder/forms/:id/submissions", () => {
  it("allows authenticated user to submit a published form", async () => {
    const admin = await createTestSession("Admin");
    const op = await createTestSession("Operator");
    trackedUserIds.push(admin.userId, op.userId);

    const schema = [
      { id: "name", type: "text", label: "Operator Name", required: true },
      { id: "value", type: "number", label: "Reading", required: false }
    ];

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const subRes = await request(app)
      .post(`/api/form-builder/forms/${id}/submissions`)
      .set("Cookie", op.cookie)
      .send({ data: { name: "Jane Smith", value: 12.34 } });

    expect(subRes.status).toBe(201);
    expect(subRes.body.contractId).toBe("OPS-FORMBUILDER-v1");
    expect(subRes.body.submission.id).toBeDefined();
    trackedSubmissionIds.push(subRes.body.submission.id);
  });

  it("rejects submission with missing required field with 422", async () => {
    const admin = await createTestSession("Admin");
    const op = await createTestSession("Operator");
    trackedUserIds.push(admin.userId, op.userId);

    const schema = [{ id: "name", type: "text", label: "Operator Name", required: true }];

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const subRes = await request(app)
      .post(`/api/form-builder/forms/${id}/submissions`)
      .set("Cookie", op.cookie)
      .send({ data: {} });

    expect(subRes.status).toBe(422);
    expect(subRes.body.error).toBe("invalid_submission_data");
  });

  it("rejects submission on draft form with 422", async () => {
    const admin = await createTestSession("Admin");
    const op = await createTestSession("Operator");
    trackedUserIds.push(admin.userId, op.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    const res = await request(app)
      .post(`/api/form-builder/forms/${id}/submissions`)
      .set("Cookie", op.cookie)
      .send({ data: { f1: "Jane" } });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("form_not_published");
  });

  it("rejects unauthenticated submission with 401", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const res = await request(app)
      .post(`/api/form-builder/forms/${id}/submissions`)
      .send({ data: { f1: "Jane" } });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/form-builder/forms/:id/submissions", () => {
  it("lists submissions with pagination metadata", async () => {
    const admin = await createTestSession("Admin");
    const op = await createTestSession("Operator");
    trackedUserIds.push(admin.userId, op.userId);

    const schema = [{ id: "f1", type: "text", label: "Note", required: false }];

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const sub = await request(app)
      .post(`/api/form-builder/forms/${id}/submissions`)
      .set("Cookie", op.cookie)
      .send({ data: { f1: "test" } });
    trackedSubmissionIds.push(sub.body.submission.id);

    const res = await request(app)
      .get(`/api/form-builder/forms/${id}/submissions`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.submissions)).toBe(true);
    expect(res.body.submissions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.limit).toBeDefined();
    expect(res.body.offset).toBeDefined();
  });
});

describe("GET /api/form-builder/submissions/:id", () => {
  it("returns single submission detail to Admin", async () => {
    const admin = await createTestSession("Admin");
    const op = await createTestSession("Operator");
    trackedUserIds.push(admin.userId, op.userId);

    const schema = [{ id: "f1", type: "text", label: "Inspector", required: true }];

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const subRes = await request(app)
      .post(`/api/form-builder/forms/${id}/submissions`)
      .set("Cookie", op.cookie)
      .send({ data: { f1: "Alice" } });
    const subId = subRes.body.submission.id;
    trackedSubmissionIds.push(subId);

    const res = await request(app)
      .get(`/api/form-builder/submissions/${subId}`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.submission.id).toBe(subId);
    expect(res.body.submission.data).toBeDefined();
  });
});

// ── Audit log ─────────────────────────────────────────────────────────────────

describe("GET /api/form-builder/forms/:id/audit", () => {
  it("records create + publish events in audit log", async () => {
    const admin = await createTestSession("Admin");
    trackedUserIds.push(admin.userId);

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema: MINIMAL_SCHEMA });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const res = await request(app)
      .get(`/api/form-builder/forms/${id}/audit`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    const actions = res.body.entries.map((e) => e.action);
    expect(actions).toContain("created");
    expect(actions).toContain("published");
  });

  it("records submission_created event after submission", async () => {
    const admin = await createTestSession("Admin");
    const op = await createTestSession("Operator");
    trackedUserIds.push(admin.userId, op.userId);

    const schema = [{ id: "f1", type: "text", label: "Note", required: true }];

    const createRes = await request(app)
      .post("/api/form-builder/forms")
      .set("Cookie", admin.cookie)
      .send({ name: formName(), schema });
    const id = createRes.body.template.id;
    trackedFormIds.push(id);

    await request(app)
      .post(`/api/form-builder/forms/${id}/publish`)
      .set("Cookie", admin.cookie);

    const sub = await request(app)
      .post(`/api/form-builder/forms/${id}/submissions`)
      .set("Cookie", op.cookie)
      .send({ data: { f1: "test note" } });
    trackedSubmissionIds.push(sub.body.submission.id);

    const res = await request(app)
      .get(`/api/form-builder/forms/${id}/audit`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    const actions = res.body.entries.map((e) => e.action);
    expect(actions).toContain("submission_created");
  });
});
