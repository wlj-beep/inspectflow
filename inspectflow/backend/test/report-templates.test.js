import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReportTemplate,
  getReportExportContracts,
  getReportTemplate,
  listReportTemplates,
  previewReportTemplate,
  resetReportTemplateStore,
  setReportTemplateQuery,
  updateReportTemplate
} from "../src/services/reports/reportTemplates.js";

function suffix() {
  return crypto.randomUUID().slice(0, 8);
}

function normalizeSql(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function makeTemplateRow(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    entity_type: template.entityType,
    selected_fields: [...template.selectedFields],
    filter_config: JSON.parse(JSON.stringify(template.filterConfig)),
    sort_config: JSON.parse(JSON.stringify(template.sortConfig)),
    output_formats: [...template.exportFormats],
    scope_site_id: template.siteId,
    created_by_user_id: template.createdByUserId,
    updated_by_user_id: template.updatedByUserId,
    created_at: template.createdAt,
    updated_at: template.updatedAt
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("report template builder baseline", () => {
  const templates = [];
  let nextId = 1;

  beforeEach(() => {
    resetReportTemplateStore();
    templates.length = 0;
    nextId = 1;
    vi.clearAllMocks();

    setReportTemplateQuery(async (sql, params = []) => {
      const normalized = normalizeSql(sql);

      if (normalized.startsWith("select id from report_templates where scope_site_id=$1 and lower(name)=lower($2)")) {
        const [siteId, name, ignoreId] = params;
        const match = templates.find((template) => template.siteId === siteId
          && template.name.toLowerCase() === String(name).toLowerCase()
          && (ignoreId === undefined || ignoreId === null || template.id !== Number(ignoreId)));
        return { rows: match ? [{ id: match.id }] : [] };
      }

      if (normalized.startsWith("select id, name, description, entity_type, selected_fields, filter_config, sort_config, output_formats, scope_site_id, created_by_user_id, updated_by_user_id, created_at, updated_at from report_templates where id=$1")) {
        const [id, siteId] = params;
        const match = templates.find((template) => template.id === Number(id) && (!siteId || template.siteId === siteId));
        return { rows: match ? [makeTemplateRow(match)] : [] };
      }

      if (normalized.startsWith("select id, name, description, entity_type, selected_fields, filter_config, sort_config, output_formats, scope_site_id, created_by_user_id, updated_by_user_id, created_at, updated_at from report_templates where scope_site_id=$1")) {
        const [siteId, entityType] = params;
        const rows = templates
          .filter((template) => template.siteId === siteId && (!entityType || template.entityType === entityType))
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)) || Number(right.id) - Number(left.id))
          .map(makeTemplateRow);
        return { rows };
      }

      if (normalized.startsWith("insert into report_templates")) {
        const [name, description, entityType, selectedFields, filterConfig, sortConfig, outputFormats, siteId, createdByUserId, updatedByUserId] = params;
        const now = new Date().toISOString();
        const template = {
          id: nextId++,
          name,
          description,
          entityType,
          selectedFields: JSON.parse(selectedFields),
          filterConfig: JSON.parse(filterConfig),
          sortConfig: JSON.parse(sortConfig),
          exportFormats: JSON.parse(outputFormats),
          siteId,
          createdByUserId,
          updatedByUserId,
          createdAt: now,
          updatedAt: now
        };
        templates.push(template);
        return { rows: [makeTemplateRow(template)] };
      }

      if (normalized.startsWith("update report_templates")) {
        const [name, description, entityType, selectedFields, filterConfig, sortConfig, outputFormats, updatedByUserId, id, siteId] = params;
        const existing = templates.find((template) => template.id === Number(id) && template.siteId === siteId);
        if (!existing) return { rows: [] };
        existing.name = name;
        existing.description = description;
        existing.entityType = entityType;
        existing.selectedFields = JSON.parse(selectedFields);
        existing.filterConfig = JSON.parse(filterConfig);
        existing.sortConfig = JSON.parse(sortConfig);
        existing.exportFormats = JSON.parse(outputFormats);
        existing.updatedByUserId = updatedByUserId;
        existing.updatedAt = new Date().toISOString();
        return { rows: [makeTemplateRow(existing)] };
      }

      if (normalized.includes("from jobs j")) {
        return {
          rows: [
            {
              id: "J-RPT-OPEN",
              part_id: "1234",
              part_description: "Widget Frame",
              part_revision_code: "A",
              operation_id: 20,
              operation_number: "20",
              operation_label: "Inspect",
              lot: "LOT-OPEN",
              qty: 4,
              status: "open",
              lock_owner_user_id: null,
              lock_timestamp: null
            },
            {
              id: "J-RPT-CLOSED",
              part_id: "1234",
              part_description: "Widget Frame",
              part_revision_code: "A",
              operation_id: 20,
              operation_number: "20",
              operation_label: "Inspect",
              lot: "LOT-CLOSED",
              qty: 4,
              status: "closed",
              lock_owner_user_id: null,
              lock_timestamp: null
            }
          ]
        };
      }

      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  afterEach(() => {
    setReportTemplateQuery(null);
  });

  it("creates, lists, gets, and updates a saved template with persisted filter and sort config", async () => {
    const name = `Job Template ${suffix()}`;
    const created = await createReportTemplate({
      name,
      description: "Open jobs by status",
      entityType: "job",
      selectedFields: ["id", "part_id", "status"],
      filterConfig: {
        combinator: "and",
        rules: [
          { field: "status", operator: "eq", value: "open" }
        ]
      },
      sortConfig: [
        { field: "id", direction: "asc" }
      ],
      exportFormats: ["csv", "pdf", "excel"]
    }, { siteId: "default", actorUserId: 10 });

    expect(created).toMatchObject({
      name,
      description: "Open jobs by status",
      entity_type: "job"
    });
    expect(created.selected_fields).toEqual(["id", "part_id", "status"]);
    expect(created.filter_config).toMatchObject({
      combinator: "and",
      rules: [{ field: "status", operator: "eq", value: "open" }]
    });
    expect(created.sort_config).toEqual([{ field: "id", direction: "asc" }]);
    expect(created.export_formats).toEqual(["csv", "pdf", "excel"]);

    const listed = await listReportTemplates({ siteId: "default", entityType: "job" });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      name
    });

    const fetched = await getReportTemplate(created.id, { siteId: "default" });
    expect(fetched).toMatchObject({
      id: created.id,
      name,
      entity_type: "job"
    });

    const updated = await updateReportTemplate(created.id, {
      name: `${name} Updated`,
      description: "Updated filter set",
      selectedFields: ["id", "part_id", "status", "lot"],
      filterConfig: {
        combinator: "and",
        rules: [
          { field: "status", operator: "eq", value: "closed" }
        ]
      },
      sortConfig: [
        { field: "id", direction: "desc" }
      ],
      exportFormats: ["csv", "excel"]
    }, { siteId: "default", actorUserId: 11 });

    expect(updated).toMatchObject({
      id: created.id,
      name: `${name} Updated`,
      description: "Updated filter set",
      entity_type: "job"
    });
    expect(updated.selected_fields).toEqual(["id", "part_id", "status", "lot"]);
    expect(updated.filter_config.rules[0]).toMatchObject({
      field: "status",
      operator: "eq",
      value: "closed"
    });
    expect(updated.sort_config).toEqual([{ field: "id", direction: "desc" }]);
    expect(updated.export_formats).toEqual(["csv", "excel"]);

    const listedAfterUpdate = await listReportTemplates({ siteId: "default", entityType: "job" });
    expect(listedAfterUpdate[0]).toMatchObject({
      id: created.id,
      name: `${name} Updated`
    });
  });

  it("previews resolved rows for a selected entity type using the stored filter and field set", async () => {
    const name = `Preview Template ${suffix()}`;
    const created = await createReportTemplate({
      name,
      entityType: "job",
      selectedFields: ["id", "part_id", "status", "lot"],
      filterConfig: {
        combinator: "and",
        rules: [
          { field: "id", operator: "eq", value: "J-RPT-OPEN" },
          { field: "status", operator: "eq", value: "open" }
        ]
      },
      sortConfig: [
        { field: "id", direction: "asc" }
      ]
    }, { siteId: "default", actorUserId: 10 });

    const preview = await previewReportTemplate({ templateId: created.id, limit: 10, siteId: "default" });

    expect(preview.contractId).toBe("PLAT-REPORT-v1");
    expect(preview.entityType).toBe("job");
    expect(preview.columns.map((column) => column.key)).toEqual([
      "id",
      "part_id",
      "status",
      "lot"
    ]);
    expect(preview.rows).toEqual([
      {
        id: "J-RPT-OPEN",
        part_id: "1234",
        status: "open",
        lot: "LOT-OPEN"
      }
    ]);
    expect(preview.totalRows).toBe(1);
    expect(created.id).toBeGreaterThan(0);
  });

  it("returns CSV, PDF, and Excel contract metadata for the builder", () => {
    const contracts = getReportExportContracts();
    expect(contracts.contractId).toBe("PLAT-REPORT-v1");
    expect(contracts.outputFormats.map((format) => format.key)).toEqual([
      "csv",
      "pdf",
      "excel"
    ]);
    expect(contracts.entityTypes.map((entity) => entity.entityType)).toEqual([
      "issue",
      "job",
      "record",
      "tool",
      "user"
    ]);
    expect(contracts.entityTypes.find((entity) => entity.entityType === "job").fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "id", label: "Job ID" }),
        expect.objectContaining({ key: "status", label: "Status" })
      ])
    );
  });
});
