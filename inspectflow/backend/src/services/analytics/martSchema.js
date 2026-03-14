export const MART_SCHEMA_VERSION = "ANA-MART-v3-draft1";

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
      { name: "job_id", type: "TEXT", nullable: false },
      { name: "part_id", type: "TEXT", nullable: false },
      { name: "op_number", type: "TEXT", nullable: false },
      { name: "sampled_at", type: "TIMESTAMPTZ", nullable: false },
      { name: "is_oot", type: "BOOLEAN", nullable: false },
      { name: "source_run_id", type: "INTEGER", nullable: true },
      { name: "ingest_mode", type: "TEXT", nullable: true },
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
      { name: "source_type", type: "TEXT", nullable: false },
      { name: "import_type", type: "TEXT", nullable: false },
      { name: "status", type: "TEXT", nullable: false },
      { name: "attempt_count", type: "INTEGER", nullable: false },
      { name: "retry_count", type: "INTEGER", nullable: false },
      { name: "unresolved_count", type: "INTEGER", nullable: false },
      { name: "duration_ms", type: "INTEGER", nullable: true },
      { name: "started_at", type: "TIMESTAMPTZ", nullable: true },
      { name: "finished_at", type: "TIMESTAMPTZ", nullable: true },
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
      { name: "oot_pieces", type: "INTEGER", nullable: false },
      { name: "correction_events", type: "INTEGER", nullable: false },
      { name: "first_pass_yield", type: "NUMERIC(8,4)", nullable: true },
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

