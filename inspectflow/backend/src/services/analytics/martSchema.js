import {
  ANA_MART_CONTRACT_ID,
  ANA_MART_DEFINITIONS
} from "./anaV3Vocabulary.js";

export const MART_SCHEMA_VERSION = ANA_MART_CONTRACT_ID;

export const MART_TABLE_BY_ID = Object.freeze({
  inspection_event_mart_v1: "ana_mart_inspection_fact",
  connector_run_mart_v1: "ana_mart_connector_run_fact"
});

export const MART_TABLES = [
  {
    name: "ana_mart_inspection_fact",
    description: "Piece-level inspection facts for reproducible KPI calculations.",
    grain: "record_id + dimension_id + piece_number",
    sourceContracts: ["QUAL-TRACE-v1", "INT-CONNECTOR-v2"],
    columns: [
      { name: "record_id", type: "INTEGER", nullable: false },
      { name: "dimension_id", type: "INTEGER", nullable: false },
      { name: "piece_number", type: "INTEGER", nullable: false },
      { name: "site_id", type: "TEXT", nullable: false, default: "'default'" },
      { name: "job_id", type: "TEXT", nullable: false },
      { name: "part_id", type: "TEXT", nullable: false },
      { name: "operation_id", type: "TEXT", nullable: false },
      { name: "lot", type: "TEXT", nullable: true },
      { name: "work_center_id", type: "TEXT", nullable: true },
      { name: "operator_user_id", type: "INTEGER", nullable: true },
      { name: "event_at", type: "TIMESTAMPTZ", nullable: false },
      { name: "measurement_count", type: "INTEGER", nullable: false, default: "1" },
      { name: "oot_count", type: "INTEGER", nullable: false, default: "0" },
      { name: "pass_count", type: "INTEGER", nullable: false, default: "0" },
      { name: "rework_count", type: "INTEGER", nullable: false, default: "0" },
      { name: "source_run_id", type: "INTEGER", nullable: true },
      { name: "created_at", type: "TIMESTAMPTZ", nullable: false, default: "NOW()" }
    ]
  },
  {
    name: "ana_mart_connector_run_fact",
    description: "Connector reliability fact table for ingestion quality analytics.",
    grain: "run_id",
    sourceContracts: ["INT-CONNECTOR-v2"],
    columns: [
      { name: "run_id", type: "INTEGER", nullable: false },
      { name: "site_id", type: "TEXT", nullable: false, default: "'default'" },
      { name: "connector_id", type: "TEXT", nullable: false },
      { name: "status", type: "TEXT", nullable: false },
      { name: "run_count", type: "INTEGER", nullable: false, default: "1" },
      { name: "failure_count", type: "INTEGER", nullable: false, default: "0" },
      { name: "replayed_count", type: "INTEGER", nullable: false, default: "0" },
      { name: "processed_count", type: "INTEGER", nullable: false, default: "0" },
      { name: "avg_latency_ms", type: "INTEGER", nullable: true },
      { name: "run_ended_at", type: "TIMESTAMPTZ", nullable: true },
      { name: "created_at", type: "TIMESTAMPTZ", nullable: false, default: "NOW()" }
    ]
  },
  {
    name: "ana_mart_job_rollup_day",
    description: "Daily rollups for operator/supervisor dashboard performance windows.",
    grain: "site_id + part_id + job_id + rollup_date",
    sourceContracts: ["OPS-JOBFLOW-v1", "QUAL-TRACE-v1", "INT-CONNECTOR-v2"],
    columns: [
      { name: "site_id", type: "TEXT", nullable: false, default: "'default'" },
      { name: "rollup_date", type: "DATE", nullable: false },
      { name: "part_id", type: "TEXT", nullable: false },
      { name: "job_id", type: "TEXT", nullable: false },
      { name: "total_pieces", type: "INTEGER", nullable: false },
      { name: "pass_pieces", type: "INTEGER", nullable: false },
      { name: "oot_pieces", type: "INTEGER", nullable: false },
      { name: "correction_events", type: "INTEGER", nullable: false },
      { name: "created_at", type: "TIMESTAMPTZ", nullable: false, default: "NOW()" }
    ]
  }
];

function toColumnSql(column) {
  const nullable = column.nullable ? "" : " NOT NULL";
  const defaultClause = column.default ? ` DEFAULT ${column.default}` : "";
  return `  ${column.name} ${column.type}${nullable}${defaultClause}`;
}

export function validateMartSchemaDefinition(schema = MART_TABLES) {
  const tableNames = new Set();
  const errors = [];

  for (const table of schema) {
    if (tableNames.has(table.name)) {
      errors.push(`duplicate_table:${table.name}`);
    } else {
      tableNames.add(table.name);
    }

    const columnNames = new Set();
    for (const column of table.columns || []) {
      if (columnNames.has(column.name)) {
        errors.push(`duplicate_column:${table.name}.${column.name}`);
      } else {
        columnNames.add(column.name);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateMartSchemaParity(
  martDefinitions = ANA_MART_DEFINITIONS,
  tableById = MART_TABLE_BY_ID,
  schema = MART_TABLES
) {
  const tableIndex = new Map(schema.map((table) => [table.name, table]));
  const errors = [];

  for (const [martId, tableName] of Object.entries(tableById)) {
    const definition = martDefinitions[martId];
    if (!definition) {
      errors.push(`unknown_mart_definition:${martId}`);
      continue;
    }

    const table = tableIndex.get(tableName);
    if (!table) {
      errors.push(`missing_table:${tableName}`);
      continue;
    }

    const columnNames = new Set(table.columns.map((column) => column.name));
    for (const field of [...definition.dimensions, ...definition.measures, definition.timeField]) {
      if (!columnNames.has(field)) {
        errors.push(`missing_column:${tableName}.${field}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function buildAdditiveMartMigrationDraft(schema = MART_TABLES) {
  const statements = [
    "-- Draft only: additive analytics mart scaffolding (non-destructive).",
    `-- Contract version: ${MART_SCHEMA_VERSION}`
  ];

  for (const table of schema) {
    const columns = table.columns.map(toColumnSql).join(",\n");
    statements.push(
      `CREATE TABLE IF NOT EXISTS ${table.name} (\n${columns}\n);`,
      `CREATE INDEX IF NOT EXISTS idx_${table.name}_created_at ON ${table.name} (created_at DESC);`
    );
  }

  return `${statements.join("\n\n")}\n`;
}
