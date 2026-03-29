import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { makePasswordHash, validatePasswordStrength } from "../src/auth.js";

const TEST_PASSWORD = "inspectflow";
const ROTATED_PASSWORD = "Inspectflow2!";
const SECOND_ROTATED_PASSWORD = "Inspectflow3!";
const SHORT_PASSWORD_ERROR = validatePasswordStrength("short");
const createdUsers = [];

function nextTestUsername(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createRotateUser(prefix, { mustRotatePassword = true } = {}) {
  const name = nextTestUsername(prefix);
  const inserted = await query(
    "INSERT INTO users (name, role, active) VALUES ($1,$2,true) RETURNING id, name, role",
    [name, "Operator"]
  );
  const user = inserted.rows[0];
  const hash = makePasswordHash(TEST_PASSWORD);
  await query(
    `INSERT INTO auth_local_credentials
       (user_id, password_salt, password_hash, failed_attempts, locked_until, must_rotate_password)
     VALUES ($1,$2,$3,0,NULL,$4)`,
    [user.id, hash.salt, hash.hash, mustRotatePassword]
  );
  createdUsers.push({ id: Number(user.id), name: user.name });
  return user;
}

async function cleanupAuthArtifacts(user) {
  if (!user) return;
  await query("DELETE FROM auth_event_log WHERE user_id=$1 OR username=$2", [user.id, user.name]);
  await query("DELETE FROM password_rotation_tokens WHERE user_id=$1", [user.id]);
  await query("DELETE FROM auth_local_credentials WHERE user_id=$1", [user.id]);
  await query("DELETE FROM auth_sessions WHERE user_id=$1", [user.id]);
  await query("DELETE FROM users WHERE id=$1", [user.id]);
}

describe("Password rotation tokens", () => {
  afterEach(async () => {
    delete process.env.AUTH_PASSWORD_ROTATION_TOKEN_TTL_MS;
    while (createdUsers.length > 0) {
      await cleanupAuthArtifacts(createdUsers.pop());
    }
  });

  it("stores rotation tokens hashed in the database and emits issue/consume audit events", async () => {
    const user = await createRotateUser("Auth Rotation Audit");
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/login")
      .send({ username: user.name, password: TEST_PASSWORD });

    expect(login.status).toBe(202);
    expect(login.body.rotationToken).toBeTruthy();

    const tokenRes = await query(
      `SELECT token_hash, used_at, expires_at
       FROM password_rotation_tokens
       WHERE user_id=$1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [user.id]
    );
    expect(tokenRes.rows).toHaveLength(1);
    expect(tokenRes.rows[0].token_hash).toBe(
      crypto.createHash("sha256").update(login.body.rotationToken).digest("hex")
    );
    expect(tokenRes.rows[0].token_hash).not.toBe(login.body.rotationToken);
    expect(tokenRes.rows[0].used_at).toBeNull();
    expect(new Date(tokenRes.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());

    const issuedEvents = await query(
      `SELECT event_type, metadata
       FROM auth_event_log
       WHERE user_id=$1 AND event_type='password_rotation_token_issued'
       ORDER BY created_at DESC, id DESC`,
      [user.id]
    );
    expect(issuedEvents.rows).toHaveLength(1);
    expect(issuedEvents.rows[0].metadata).toMatchObject({});

    const rotate = await agent
      .post("/api/auth/rotate-password")
      .send({
        rotationToken: login.body.rotationToken,
        nextPassword: ROTATED_PASSWORD
      });
    expect(rotate.status).toBe(200);

    const consumedTokenRes = await query(
      `SELECT used_at
       FROM password_rotation_tokens
       WHERE user_id=$1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [user.id]
    );
    expect(consumedTokenRes.rows).toHaveLength(1);
    expect(consumedTokenRes.rows[0].used_at).not.toBeNull();

    const consumedEvents = await query(
      `SELECT event_type, metadata
       FROM auth_event_log
       WHERE user_id=$1 AND event_type='password_rotation_token_consumed'
       ORDER BY created_at DESC, id DESC`,
      [user.id]
    );
    expect(consumedEvents.rows).toHaveLength(1);
    expect(consumedEvents.rows[0].metadata).toMatchObject({});
  });

  it("rejects reuse of the same rotation token after it has been consumed", async () => {
    const user = await createRotateUser("Auth Rotation Single Use");
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/login")
      .send({ username: user.name, password: TEST_PASSWORD });
    expect(login.status).toBe(202);

    const firstRotate = await agent
      .post("/api/auth/rotate-password")
      .send({
        rotationToken: login.body.rotationToken,
        nextPassword: ROTATED_PASSWORD
      });
    expect(firstRotate.status).toBe(200);

    const secondRotate = await agent
      .post("/api/auth/rotate-password")
      .send({
        rotationToken: login.body.rotationToken,
        nextPassword: SECOND_ROTATED_PASSWORD
      });
    expect(secondRotate.status).toBe(400);
    expect(secondRotate.body).toMatchObject({ error: "invalid_rotation_token" });

    const tokenRes = await query(
      `SELECT used_at
       FROM password_rotation_tokens
       WHERE user_id=$1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [user.id]
    );
    expect(tokenRes.rows[0].used_at).not.toBeNull();

    const consumedEvents = await query(
      `SELECT id
       FROM auth_event_log
       WHERE user_id=$1 AND event_type='password_rotation_token_consumed'`,
      [user.id]
    );
    expect(consumedEvents.rows).toHaveLength(1);
  });

  it("locks a rotation token after three failed attempts and audits each attempt", async () => {
    const user = await createRotateUser("Auth Rotation Lockout");
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/login")
      .send({ username: user.name, password: TEST_PASSWORD });
    expect(login.status).toBe(202);
    expect(login.body.rotationToken).toBeTruthy();

    for (let idx = 0; idx < 2; idx += 1) {
      const attempt = await agent
        .post("/api/auth/rotate-password")
        .send({
          rotationToken: login.body.rotationToken,
          nextPassword: "short"
        });
      expect(attempt.status).toBe(400);
      expect(attempt.body).toMatchObject({ error: SHORT_PASSWORD_ERROR });
    }

    const locked = await agent
      .post("/api/auth/rotate-password")
      .send({
        rotationToken: login.body.rotationToken,
        nextPassword: "short"
      });
    expect(locked.status).toBe(423);
    expect(locked.body).toMatchObject({ error: "rotation_token_locked" });

    const postLockAttempt = await agent
      .post("/api/auth/rotate-password")
      .send({
        rotationToken: login.body.rotationToken,
        nextPassword: "inspectflow-v2"
      });
    expect(postLockAttempt.status).toBe(423);
    expect(postLockAttempt.body).toMatchObject({ error: "rotation_token_locked" });

    const tokenRes = await query(
      `SELECT failed_attempts, locked_at, used_at
       FROM password_rotation_tokens
       WHERE user_id=$1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [user.id]
    );
    expect(tokenRes.rows).toHaveLength(1);
    expect(tokenRes.rows[0].failed_attempts).toBe(3);
    expect(tokenRes.rows[0].locked_at).not.toBeNull();
    expect(tokenRes.rows[0].used_at).toBeNull();

    const attemptEvents = await query(
      `SELECT event_type, metadata
       FROM auth_event_log
       WHERE user_id=$1 AND event_type='password_rotation_token_attempt'
       ORDER BY created_at DESC, id DESC`,
      [user.id]
    );
    expect(attemptEvents.rows).toHaveLength(4);
    expect(attemptEvents.rows[0].metadata).toMatchObject({ outcome: "failure", reason: "locked" });
    expect(attemptEvents.rows.some((row) => row.metadata?.locked === true)).toBe(true);

    const lockedEvents = await query(
      `SELECT event_type, metadata
       FROM auth_event_log
       WHERE user_id=$1 AND event_type='password_rotation_token_locked'
       ORDER BY created_at DESC, id DESC`,
      [user.id]
    );
    expect(lockedEvents.rows).toHaveLength(1);
    expect(lockedEvents.rows[0].metadata).toMatchObject({ reason: "max_attempts_reached" });
  });
});
