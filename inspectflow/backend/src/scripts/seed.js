import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedPath = path.resolve(__dirname, "../../db/seed.sql");
const sql = fs.readFileSync(seedPath, "utf8");

try {
  await pool.query(sql);
  console.log("Seed applied.");
} finally {
  await pool.end();
}
