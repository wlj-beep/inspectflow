import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const testUrl = process.env.DATABASE_URL_TEST;
const connectionString =
  process.env.NODE_ENV === "test" && testUrl ? testUrl : process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  options: "-c timezone=UTC"
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
