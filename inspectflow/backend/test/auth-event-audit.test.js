import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createIsolatedTestUser, cleanupTestUsers, createTestSession } from "./helpers/sessionFixtures.js";
import { recordAuthEvent } from "../src/auth.js";

const trackedUserIds = [];

function trackUser(user) {
  trackedUserIds.push(Number(user.userId ?? user.id));
  return user;
}

async function cleanupTrackedAuthRows() {
  if (trackedUserIds.length > 0) {
    await query("DELETE FROM auth_event_log WHERE user_id = ANY($1::int[])", [trackedUserIds]);
  }
  await cleanupTestUsers(trackedUserIds);
}

afterEach(async () => {
  await cleanupTrackedAuthRows();
});

describe("auth event metadata and role assignment audit", () => {
  it("strips disallowed auth-event metadata fields before persistence", async () => {
    const user = trackUser(await createIsolatedTestUser("Operator"));

    await recordAuthEvent({
      eventType: "login_failure",
      userId: user.id,
      username: user.name,
      metadata: {
        reason: "invalid_credentials",
        failedAttempts: 2,
        lockedUntil: "2026-03-28T12:00:00.000Z",
        password: "super-secret",
        ssn: "123-45-6789",
        nested: { shouldNot: "persist" }
      }
    });

    const rows = await query(
      `SELECT event_type, metadata
       FROM auth_event_log
       WHERE user_id=$1
       ORDER BY id DESC
       LIMIT 1`,
      [user.id]
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].event_type).toBe("login_failure");
    expect(rows.rows[0].metadata).toMatchObject({
      reason: "invalid_credentials",
      failedAttempts: 2,
      lockedUntil: "2026-03-28T12:00:00.000Z"
    });
    expect(rows.rows[0].metadata.password).toBeUndefined();
    expect(rows.rows[0].metadata.ssn).toBeUndefined();
    expect(rows.rows[0].metadata.nested).toBeUndefined();
  });

  it("emits a standard user_updated event for non-admin role assignments", async () => {
    const admin = trackUser(await createTestSession("Admin"));
    const target = trackUser(await createIsolatedTestUser("Operator"));

    const updated = await request(app)
      .put(`/api/users/${target.id}`)
      .set("Cookie", admin.cookie)
      .send({
        role: "Quality"
      });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: target.id, role: "Quality" });

    const rows = await query(
      `SELECT event_type, user_id, actor_role, metadata
       FROM auth_event_log
       WHERE user_id=$1 AND event_type='user_updated'
       ORDER BY id DESC
       LIMIT 1`,
      [target.id]
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      event_type: "user_updated",
      user_id: target.id,
      actor_role: "Admin"
    });
    expect(rows.rows[0].metadata).toMatchObject({
      actorUserId: admin.userId,
      previousRole: "Operator",
      assignedRole: "Quality"
    });
  });

  it("emits admin_role_assigned when a user is promoted to Admin", async () => {
    const admin = trackUser(await createTestSession("Admin"));
    const target = trackUser(await createIsolatedTestUser("Quality"));

    const updated = await request(app)
      .put(`/api/users/${target.id}`)
      .set("Cookie", admin.cookie)
      .send({
        role: "Admin"
      });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: target.id, role: "Admin" });

    const rows = await query(
      `SELECT event_type, user_id, actor_role, metadata
       FROM auth_event_log
       WHERE user_id=$1 AND event_type='admin_role_assigned'
       ORDER BY id DESC
       LIMIT 1`,
      [target.id]
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      event_type: "admin_role_assigned",
      user_id: target.id,
      actor_role: "Admin"
    });
    expect(rows.rows[0].metadata).toMatchObject({
      actorUserId: admin.userId,
      previousRole: "Quality",
      assignedRole: "Admin"
    });
  });
});
