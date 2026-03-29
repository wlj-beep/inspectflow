import { describe, expect, it } from "vitest";
import { query } from "../src/db.js";

describe("UTC timezone verification", () => {
  it("uses UTC timezone for the database session", async () => {
    const { rows } = await query("SHOW TIMEZONE");
    expect(String(rows[0]?.TimeZone || rows[0]?.timezone || "").toUpperCase()).toBe("UTC");
  });

  it("renders NOW() with explicit +00 offset", async () => {
    const { rows } = await query("SELECT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SSOF') AS now_utc");
    expect(String(rows[0]?.now_utc || "")).toMatch(/\+00$/);
  });
});

