import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import { getDefaultSeedPassword, makePasswordHash, validatePasswordStrength } from "../auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedPath = path.resolve(__dirname, "../../db/seed.sql");
const sql = fs.readFileSync(seedPath, "utf8");

try {
  await pool.query(sql);
  const defaultPassword = getDefaultSeedPassword();
  const policyError = validatePasswordStrength(defaultPassword);
  if (policyError) {
    throw new Error(`default_seed_password_invalid: ${policyError}`);
  }
  const users = await pool.query("SELECT id FROM users", []);
  for (const row of users.rows) {
    const hashed = makePasswordHash(defaultPassword);
    await pool.query(
      `INSERT INTO auth_local_credentials
         (user_id, password_salt, password_hash, failed_attempts, locked_until, must_rotate_password)
       VALUES ($1,$2,$3,0,NULL,true)
       ON CONFLICT (user_id) DO UPDATE
       SET password_salt=EXCLUDED.password_salt,
           password_hash=EXCLUDED.password_hash,
           failed_attempts=0,
           locked_until=NULL,
           must_rotate_password=true,
           password_updated_at=NOW()`,
      [row.id, hashed.salt, hashed.hash]
    );
  }
  console.log(`Seeded local credentials for ${users.rows.length} users.`);
  console.log("Seed applied.");
} finally {
  await pool.end();
}
