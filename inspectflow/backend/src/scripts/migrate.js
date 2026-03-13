import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.resolve(__dirname, "../../db/schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

try {
  await pool.query(sql);
  console.log("Schema applied.");
} finally {
  await pool.end();
}
