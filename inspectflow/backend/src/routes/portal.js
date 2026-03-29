import crypto from "node:crypto";
import { Router } from "express";
import { pool, query } from "../db.js";
import { requireAuthenticated, getActorRole, getActorUserId } from "../middleware/authSession.js";

const router = Router();

const ADMIN_ROLES = new Set(["Admin"]);
const PORTAL_TYPES = new Set(["supplier", "customer"]);
const DOC_TYPES = new Set(["coc", "ppap", "psw"]);
const SESSION_TTL_HOURS = Number(process.env.PORTAL_SESSION_TTL_HOURS || 24);
const INVITE_TTL_DAYS = Number(process.env.PORTAL_INVITE_TTL_DAYS || 14);

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeText(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

function isAdmin(req) {
  return ADMIN_ROLES.has(getActorRole(req));
}

function hashToken(token) {
  const pepper = String(process.env.AUTH_TOKEN_PEPPER || "");
  return crypto.createHash("sha256").update(`${pepper}:${String(token || "")}`).digest("hex");
}

function issueRawToken(bytes = 36) {
  return crypto.randomBytes(bytes).toString("hex");
}

function sessionExpiresAt(hours = SESSION_TTL_HOURS) {
  return new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);
}

function inviteExpiresAt(days = INVITE_TTL_DAYS) {
  return new Date(Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000);
}

function readBearerToken(req) {
  const auth = String(req.header("authorization") || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const raw = auth.slice(7).trim();
  return raw || null;
}

async function attachPortalSession(req, _res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      req.portalAuth = null;
      return next();
    }

    const tokenHash = hashToken(token);
    const { rows } = await query(
      `SELECT
         s.id AS session_id,
         s.expires_at,
         i.id AS invitation_id,
         i.portal_type,
         i.supplier_id,
         i.customer_name,
         i.email,
         i.status AS invitation_status,
         i.expires_at AS invitation_expires_at
       FROM portal_sessions s
       JOIN portal_invitations i ON i.id = s.invitation_id
       WHERE s.session_token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND i.status IN ('pending', 'accepted')
         AND i.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    const row = rows[0];
    if (!row) {
      req.portalAuth = null;
      return next();
    }

    await query("UPDATE portal_sessions SET last_seen_at = NOW() WHERE id = $1", [row.session_id]);

    req.portalAuth = {
      sessionId: Number(row.session_id),
      expiresAt: row.expires_at,
      invitation: {
        id: Number(row.invitation_id),
        portalType: row.portal_type,
        supplierId: row.supplier_id == null ? null : Number(row.supplier_id),
        customerName: row.customer_name || null,
        email: row.email,
        status: row.invitation_status,
        expiresAt: row.invitation_expires_at
      }
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

function requirePortalSession(req, res, next) {
  if (!req.portalAuth?.invitation?.id) {
    return res.status(401).json({ error: "portal_unauthenticated" });
  }
  return next();
}

function requirePortalType(type) {
  return (req, res, next) => {
    if (req.portalAuth?.invitation?.portalType !== type) {
      return res.status(403).json({ error: "portal_forbidden" });
    }
    return next();
  };
}

async function supplierCanAccessCapa(capaId, supplierId) {
  const { rows } = await query(
    `SELECT c.id
     FROM capa_records c
     JOIN nonconformances n ON n.id = c.source_ncr_id
     WHERE c.id = $1
       AND EXISTS (
         SELECT 1
         FROM incoming_inspections ii
         WHERE ii.linked_ncr_id = n.id
           AND ii.supplier_id = $2
       )
     LIMIT 1`,
    [capaId, supplierId]
  );
  return Boolean(rows[0]);
}

async function customerHasExplicitDocAccess(invitationId) {
  const { rows } = await query(
    "SELECT COUNT(*)::int AS total FROM portal_document_access WHERE invitation_id = $1",
    [invitationId]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function customerCanAccessDoc(invitation, documentType, documentId) {
  const invitationId = Number(invitation.id);
  const useExplicitList = await customerHasExplicitDocAccess(invitationId);

  if (useExplicitList) {
    const { rows } = await query(
      `SELECT 1
       FROM portal_document_access
       WHERE invitation_id = $1 AND document_type = $2 AND document_id = $3
       LIMIT 1`,
      [invitationId, documentType, documentId]
    );
    return Boolean(rows[0]);
  }

  if (documentType === "coc") {
    const { rows } = await query(
      `SELECT 1
       FROM certificates_of_conformance
       WHERE id = $1
         AND status = 'issued'
         AND LOWER(COALESCE(customer_name, '')) = LOWER($2)
       LIMIT 1`,
      [documentId, invitation.customerName || ""]
    );
    return Boolean(rows[0]);
  }

  if (documentType === "ppap" || documentType === "psw") {
    const { rows } = await query(
      `SELECT 1
       FROM ppap_packages
       WHERE id = $1
         AND LOWER(COALESCE(customer_name, '')) = LOWER($2)
       LIMIT 1`,
      [documentId, invitation.customerName || ""]
    );
    return Boolean(rows[0]);
  }

  return false;
}

router.post("/invitations", requireAuthenticated, async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });

    const portalType = String(req.body?.portalType || "").trim().toLowerCase();
    if (!PORTAL_TYPES.has(portalType)) {
      return res.status(400).json({ error: "invalid_portal_type" });
    }

    const email = normalizeText(req.body?.email);
    if (!email) return res.status(400).json({ error: "email_required" });

    const supplierId = parsePositiveInt(req.body?.supplierId);
    const customerName = normalizeText(req.body?.customerName);

    if (portalType === "supplier" && !supplierId) {
      return res.status(400).json({ error: "supplier_id_required" });
    }
    if (portalType === "customer" && !customerName) {
      return res.status(400).json({ error: "customer_name_required" });
    }

    const token = issueRawToken(24);
    const tokenHash = hashToken(token);
    const actorUserId = getActorUserId(req);
    const expiresAt = inviteExpiresAt(parsePositiveInt(req.body?.expiresInDays) || INVITE_TTL_DAYS);

    const { rows } = await query(
      `INSERT INTO portal_invitations
         (portal_type, email, supplier_id, customer_name, invite_token_hash, status, expires_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
       RETURNING id, portal_type, email, supplier_id, customer_name, status, expires_at, created_at`,
      [portalType, email, supplierId, customerName, tokenHash, expiresAt.toISOString(), actorUserId]
    );

    return res.status(201).json({
      invitation: rows[0],
      inviteToken: token
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/invitations", requireAuthenticated, async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });

    const { rows } = await query(
      `SELECT id, portal_type, email, supplier_id, customer_name, status,
              expires_at, accepted_at, revoked_at, created_by_user_id, created_at, updated_at
       FROM portal_invitations
       ORDER BY created_at DESC`
    );

    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post("/invitations/:id/revoke", requireAuthenticated, async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const invitationId = parsePositiveInt(req.params.id);
    if (!invitationId) return res.status(400).json({ error: "invalid_id" });

    const { rows } = await query(
      `UPDATE portal_invitations
       SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, revoked_at`,
      [invitationId]
    );
    if (!rows[0]) return res.status(404).json({ error: "invitation_not_found" });

    await query(
      `UPDATE portal_sessions
       SET revoked_at = NOW()
       WHERE invitation_id = $1
         AND revoked_at IS NULL`,
      [invitationId]
    );

    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.post("/invitations/:id/document-access", requireAuthenticated, async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const invitationId = parsePositiveInt(req.params.id);
    const documentId = parsePositiveInt(req.body?.documentId);
    const documentType = String(req.body?.documentType || "").trim().toLowerCase();
    if (!invitationId || !documentId || !DOC_TYPES.has(documentType)) {
      return res.status(400).json({ error: "invalid_document_access_input" });
    }

    const { rows } = await query(
      `INSERT INTO portal_document_access (invitation_id, document_type, document_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (invitation_id, document_type, document_id) DO NOTHING
       RETURNING id, invitation_id, document_type, document_id, created_at`,
      [invitationId, documentType, documentId]
    );

    if (!rows[0]) {
      const existing = await query(
        `SELECT id, invitation_id, document_type, document_id, created_at
         FROM portal_document_access
         WHERE invitation_id = $1 AND document_type = $2 AND document_id = $3`,
        [invitationId, documentType, documentId]
      );
      return res.status(200).json(existing.rows[0]);
    }

    return res.status(201).json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.post("/auth/redeem", async (req, res, next) => {
  try {
    const token = normalizeText(req.body?.inviteToken || req.body?.token);
    if (!token) return res.status(400).json({ error: "invite_token_required" });

    const tokenHash = hashToken(token);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT id, portal_type, supplier_id, customer_name, email, status, expires_at
         FROM portal_invitations
         WHERE invite_token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );

      const invitation = rows[0];
      if (!invitation) {
        await client.query("ROLLBACK");
        return res.status(401).json({ error: "invalid_invite_token" });
      }

      const isExpired = new Date(invitation.expires_at).getTime() <= Date.now();
      if (isExpired) {
        await client.query(
          `UPDATE portal_invitations
           SET status = 'expired', updated_at = NOW()
           WHERE id = $1`,
          [invitation.id]
        );
        await client.query("ROLLBACK");
        return res.status(410).json({ error: "invite_expired" });
      }

      if (invitation.status === "revoked") {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "invite_revoked" });
      }

      const rawSessionToken = issueRawToken(36);
      const sessionTokenHash = hashToken(rawSessionToken);
      const expiresAt = sessionExpiresAt();

      const { rows: sessionRows } = await client.query(
        `INSERT INTO portal_sessions (invitation_id, session_token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id, expires_at`,
        [invitation.id, sessionTokenHash, expiresAt.toISOString()]
      );

      await client.query(
        `UPDATE portal_invitations
         SET status = 'accepted', accepted_at = COALESCE(accepted_at, NOW()), updated_at = NOW()
         WHERE id = $1`,
        [invitation.id]
      );

      await client.query("COMMIT");
      return res.json({
        sessionToken: rawSessionToken,
        expiresAt: sessionRows[0].expires_at,
        invitation: {
          id: Number(invitation.id),
          portalType: invitation.portal_type,
          supplierId: invitation.supplier_id == null ? null : Number(invitation.supplier_id),
          customerName: invitation.customer_name || null,
          email: invitation.email
        }
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return next(err);
  }
});

router.use(attachPortalSession);

router.get("/me", requirePortalSession, async (req, res) => {
  return res.json({
    sessionId: req.portalAuth.sessionId,
    sessionExpiresAt: req.portalAuth.expiresAt,
    invitation: req.portalAuth.invitation
  });
});

router.post("/auth/logout", requirePortalSession, async (req, res, next) => {
  try {
    await query(
      `UPDATE portal_sessions
       SET revoked_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL`,
      [req.portalAuth.sessionId]
    );
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.get(
  "/supplier/incoming-inspections",
  requirePortalSession,
  requirePortalType("supplier"),
  async (req, res, next) => {
    try {
      const supplierId = req.portalAuth.invitation.supplierId;
      const status = normalizeText(req.query.status);
      const limit = Math.min(parsePositiveInt(req.query.limit) || 50, 200);
      const params = [supplierId];
      let where = "WHERE ii.supplier_id = $1";
      if (status) {
        params.push(status);
        where += ` AND ii.status = $${params.length}`;
      }
      params.push(limit);

      const { rows } = await query(
        `SELECT ii.id, ii.supplier_id, ii.supplier_item_id, ii.received_quantity, ii.inspected_quantity,
                ii.accepted_quantity, ii.rejected_quantity, ii.status, ii.linked_ncr_id,
                ii.inspection_date, ii.created_at,
                si.part_id, si.item_code,
                s.name AS supplier_name,
                n.title AS linked_ncr_title
         FROM incoming_inspections ii
         JOIN suppliers s ON s.id = ii.supplier_id
         LEFT JOIN supplier_items si ON si.id = ii.supplier_item_id
         LEFT JOIN nonconformances n ON n.id = ii.linked_ncr_id
         ${where}
         ORDER BY ii.inspection_date DESC
         LIMIT $${params.length}`,
        params
      );

      return res.json({ records: rows });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/supplier/capa",
  requirePortalSession,
  requirePortalType("supplier"),
  async (req, res, next) => {
    try {
      const supplierId = req.portalAuth.invitation.supplierId;
      const invitationId = req.portalAuth.invitation.id;
      const status = normalizeText(req.query.status);
      const params = [supplierId, invitationId];
      let statusFilter = "";
      if (status) {
        params.push(status);
        statusFilter = ` AND c.status = $${params.length}`;
      }

      const { rows } = await query(
        `SELECT c.id, c.title, c.problem_statement, c.status, c.due_at, c.created_at, c.updated_at,
                c.source_ncr_id,
                pcr.response_text,
                pcr.status AS response_status,
                pcr.updated_at AS response_updated_at
         FROM capa_records c
         LEFT JOIN portal_capa_responses pcr
           ON pcr.capa_id = c.id AND pcr.invitation_id = $2
         WHERE EXISTS (
           SELECT 1
           FROM nonconformances n
           JOIN incoming_inspections ii ON ii.linked_ncr_id = n.id
           WHERE n.id = c.source_ncr_id
             AND ii.supplier_id = $1
         )
         ${statusFilter}
         ORDER BY c.created_at DESC`,
        params
      );

      return res.json({ records: rows });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/supplier/capa/:id/respond",
  requirePortalSession,
  requirePortalType("supplier"),
  async (req, res, next) => {
    try {
      const supplierId = req.portalAuth.invitation.supplierId;
      const invitationId = req.portalAuth.invitation.id;
      const capaId = parsePositiveInt(req.params.id);
      const responseText = normalizeText(req.body?.responseText);

      if (!capaId || !responseText) {
        return res.status(400).json({ error: "invalid_capa_response" });
      }

      const canAccess = await supplierCanAccessCapa(capaId, supplierId);
      if (!canAccess) return res.status(404).json({ error: "capa_not_found" });

      const { rows } = await query(
        `INSERT INTO portal_capa_responses (capa_id, invitation_id, response_text, status)
         VALUES ($1, $2, $3, 'submitted')
         ON CONFLICT (capa_id, invitation_id)
         DO UPDATE SET
           response_text = EXCLUDED.response_text,
           status = 'updated',
           updated_at = NOW()
         RETURNING id, capa_id, invitation_id, response_text, status, created_at, updated_at`,
        [capaId, invitationId, responseText]
      );

      return res.status(201).json(rows[0]);
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/customer/documents",
  requirePortalSession,
  requirePortalType("customer"),
  async (req, res, next) => {
    try {
      const invitation = req.portalAuth.invitation;
      const invitationId = invitation.id;
      const customerName = invitation.customerName || "";
      const useExplicitList = await customerHasExplicitDocAccess(invitationId);

      let cocRows = [];
      let ppapRows = [];

      if (useExplicitList) {
        const { rows: accessRows } = await query(
          `SELECT document_type, document_id
           FROM portal_document_access
           WHERE invitation_id = $1`,
          [invitationId]
        );
        const cocIds = accessRows.filter((r) => r.document_type === "coc").map((r) => Number(r.document_id));
        const ppapIds = accessRows
          .filter((r) => r.document_type === "ppap" || r.document_type === "psw")
          .map((r) => Number(r.document_id));

        if (cocIds.length) {
          const { rows } = await query(
            `SELECT id, coc_number, customer_name, purchase_order, spec_reference, status, created_at
             FROM certificates_of_conformance
             WHERE id = ANY($1::int[])
             ORDER BY created_at DESC`,
            [cocIds]
          );
          cocRows = rows;
        }

        if (ppapIds.length) {
          const { rows } = await query(
            `SELECT p.id, p.part_id, p.customer_name, p.submission_level, p.status, p.updated_at,
                    (SELECT a.decision FROM ppap_customer_approvals a WHERE a.package_id = p.id ORDER BY a.decided_at DESC LIMIT 1) AS latest_decision,
                    (SELECT a.customer_reference FROM ppap_customer_approvals a WHERE a.package_id = p.id ORDER BY a.decided_at DESC LIMIT 1) AS latest_customer_reference
             FROM ppap_packages p
             WHERE p.id = ANY($1::int[])
             ORDER BY p.updated_at DESC`,
            [ppapIds]
          );
          ppapRows = rows;
        }
      } else {
        const { rows: cocDefault } = await query(
          `SELECT id, coc_number, customer_name, purchase_order, spec_reference, status, created_at
           FROM certificates_of_conformance
           WHERE status = 'issued'
             AND LOWER(COALESCE(customer_name, '')) = LOWER($1)
           ORDER BY created_at DESC`,
          [customerName]
        );
        cocRows = cocDefault;

        const { rows: ppapDefault } = await query(
          `SELECT p.id, p.part_id, p.customer_name, p.submission_level, p.status, p.updated_at,
                  (SELECT a.decision FROM ppap_customer_approvals a WHERE a.package_id = p.id ORDER BY a.decided_at DESC LIMIT 1) AS latest_decision,
                  (SELECT a.customer_reference FROM ppap_customer_approvals a WHERE a.package_id = p.id ORDER BY a.decided_at DESC LIMIT 1) AS latest_customer_reference
           FROM ppap_packages p
           WHERE LOWER(COALESCE(p.customer_name, '')) = LOWER($1)
           ORDER BY p.updated_at DESC`,
          [customerName]
        );
        ppapRows = ppapDefault;
      }

      return res.json({
        coc: cocRows,
        ppap: ppapRows,
        psw: ppapRows.map((row) => ({
          packageId: row.id,
          partId: row.part_id,
          customerName: row.customer_name,
          submissionLevel: row.submission_level,
          packageStatus: row.status,
          latestDecision: row.latest_decision || null,
          customerReference: row.latest_customer_reference || null,
          updatedAt: row.updated_at
        }))
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/customer/documents/:type/:id/download",
  requirePortalSession,
  requirePortalType("customer"),
  async (req, res, next) => {
    try {
      const invitation = req.portalAuth.invitation;
      const type = String(req.params.type || "").trim().toLowerCase();
      const id = parsePositiveInt(req.params.id);
      if (!DOC_TYPES.has(type) || !id) {
        return res.status(400).json({ error: "invalid_document_request" });
      }

      const canAccess = await customerCanAccessDoc(invitation, type, id);
      if (!canAccess) return res.status(404).json({ error: "document_not_found" });

      if (type === "coc") {
        const { rows } = await query(
          `SELECT id, coc_number, customer_name, purchase_order, spec_reference,
                  statement_rendered, created_at
           FROM certificates_of_conformance
           WHERE id = $1`,
          [id]
        );
        if (!rows[0]) return res.status(404).json({ error: "document_not_found" });
        return res.json({ type: "coc", document: rows[0] });
      }

      const { rows: packageRows } = await query(
        `SELECT id, part_id, customer_name, submission_level, status, notes, created_at, updated_at
         FROM ppap_packages
         WHERE id = $1`,
        [id]
      );
      if (!packageRows[0]) return res.status(404).json({ error: "document_not_found" });

      const { rows: elementRows } = await query(
        `SELECT element_code, status, notes
         FROM ppap_elements
         WHERE package_id = $1
         ORDER BY element_code ASC`,
        [id]
      );

      const { rows: approvalRows } = await query(
        `SELECT decision, customer_reference, notes, decided_at
         FROM ppap_customer_approvals
         WHERE package_id = $1
         ORDER BY decided_at DESC`,
        [id]
      );

      if (type === "ppap") {
        return res.json({
          type: "ppap",
          package: packageRows[0],
          elements: elementRows,
          approvals: approvalRows
        });
      }

      return res.json({
        type: "psw",
        psw: {
          packageId: packageRows[0].id,
          partId: packageRows[0].part_id,
          customerName: packageRows[0].customer_name,
          submissionLevel: packageRows[0].submission_level,
          packageStatus: packageRows[0].status,
          latestApproval: approvalRows[0] || null,
          elementStatuses: elementRows
        }
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
