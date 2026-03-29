/**
 * Reusable session-auth fixture helpers for backend integration tests.
 *
 * Usage:
 *   import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";
 *
 *   const { agent, cookie, userId } = await createTestSession("Admin");
 *   // use agent directly, or use cookie in supertest .set("Cookie", cookie)
 *   // register userId for cleanup via registeredUserIds.push(userId)
 */

import request from "supertest";
import app from "../../src/index.js";
import { query } from "../../src/db.js";
import { makePasswordHash } from "../../src/auth.js";

const TEST_PASSWORD = "inspectflow";

/**
 * Generate a unique username safe for concurrent test runs.
 */
function makeTestUsername(role) {
  return `test-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Insert a test user + credentials row and return the user record.
 * The caller is responsible for registering the returned userId for cleanup.
 */
export async function createIsolatedTestUser(role, { mustRotatePassword = false } = {}) {
  const name = makeTestUsername(role);
  const inserted = await query(
    "INSERT INTO users (name, role, active) VALUES ($1,$2,true) RETURNING id, name, role",
    [name, role]
  );
  const user = inserted.rows[0];
  const hash = makePasswordHash(TEST_PASSWORD);
  await query(
    `INSERT INTO auth_local_credentials
       (user_id, password_salt, password_hash, failed_attempts, locked_until, must_rotate_password)
     VALUES ($1,$2,$3,0,NULL,$4)`,
    [user.id, hash.salt, hash.hash, mustRotatePassword]
  );
  return { id: Number(user.id), name: user.name, role: user.role };
}

/**
 * Create a test user of the given role, perform a login, and return
 * the session cookie string and the userId.
 *
 * @param {string} role  - "Admin" | "Operator" | "Supervisor" | "Quality"
 * @returns {{ agent: import('supertest').SuperAgentTest, cookie: string, userId: number, username: string }}
 */
export async function createTestSession(role) {
  const user = await createIsolatedTestUser(role);
  const agent = request.agent(app);
  const loginRes = await agent
    .post("/api/auth/login")
    .send({ username: user.name, password: TEST_PASSWORD });

  if (loginRes.status !== 200) {
    throw new Error(
      `createTestSession: login failed for role=${role} status=${loginRes.status} body=${JSON.stringify(loginRes.body)}`
    );
  }

  // Extract the Set-Cookie header value so callers can pass it via .set("Cookie", cookie).
  const rawCookies = loginRes.headers["set-cookie"] || [];
  const sessionCookie = rawCookies
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("inspectflow_session="));

  if (!sessionCookie) {
    throw new Error(`createTestSession: no session cookie in response for role=${role}`);
  }

  return { agent, cookie: sessionCookie, userId: user.id, username: user.name };
}

/**
 * Hard-delete test users (and dependent credential/session rows) by user ID.
 * Designed for use in afterEach/afterAll teardown blocks.
 *
 * @param {number[]} userIds
 */
export async function cleanupTestUsers(userIds) {
  for (const userId of userIds) {
    await query("DELETE FROM auth_local_credentials WHERE user_id=$1", [userId]);
    await query("DELETE FROM auth_sessions WHERE user_id=$1", [userId]);
    await query("DELETE FROM users WHERE id=$1", [userId]);
  }
  // Clear the array in-place so callers that pass a shared array stay tidy.
  userIds.length = 0;
}
