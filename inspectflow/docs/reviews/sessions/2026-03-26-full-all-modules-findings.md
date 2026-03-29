# Review Session: 2026-03-26 — Full — All Modules

## Session Header
- **Date:** 2026-03-26
- **Mode:** Full
- **Scope:** Entire codebase (backend auth, routes, services, analytics, integrations, frontend, tests, DB schema, docs)
- **Commit hash (HEAD):** `b77fd19a99b59d31ebf130b70e0e9c63b61691a9`
- **Reviewer:** Independent Reviewer

## Lens Checklist
- [x] Security
- [x] Architecture
- [x] Code Quality
- [x] Test Coverage
- [x] Performance
- [x] Documentation

---

## Findings

| RV-### | Severity | Lens | File(s):line | Finding | Recommendation | Stream | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RV-001 | Critical | Security | `backend/src/routes/auth.js:154-164` | `GET /api/auth/users` is completely unauthenticated. Any caller can enumerate all active users, their names, and roles with zero auth. | Require `requireAuthenticated` middleware. Add pagination. Return only `id` and `name`. | PLAT | Pending |
| RV-002 | Critical | Security | `backend/src/index.js:89-97` | CORS validation is fully bypassed when `NODE_ENV === "test"`. If test env detection fails or is misconfigured in deployment, all CORS protections disappear. Also allows requests with no `Origin` header. | Remove the test-env CORS bypass entirely. Reject requests without `Origin` unless explicitly required. Mock CORS at the test layer instead. | PLAT | Pending |
| RV-003 | Critical | Security | `backend/src/auth.js:55-61` | Session token pepper is conditionally enforced. In non-production environments an empty pepper is allowed, making tokens hashed as `sha256(":token")` — deterministic and easily reversed by anyone with DB access. | Always require and validate a non-empty pepper value regardless of environment. Upgrade hashing to PBKDF2 or Argon2 for session token storage. | PLAT | Pending |
| RV-004 | Critical | Security | `backend/src/routes/auth.js:47-148` | Password rotation tokens are stored in a JavaScript `Map` in server memory. They are lost on restart, have no audit trail, and are exposed in plaintext if server memory is ever dumped. | Store rotation tokens in the DB as hashed values (same pattern as session tokens). Record issuance and consumption in the audit log. | PLAT | Pending |
| RV-005 | Critical | Security | `backend/src/services/analytics/martBuilder.js:252-264` | `orderBy` and `keyColumns` parameters are interpolated directly into SQL template strings without escaping: `` `ORDER BY ${orderBy}` `` and `` `CONCAT_WS('|', ${keyColumns})` ``. This is an injection vector if upstream sources ever become partially untrusted. | Validate `orderBy` against an explicit allowlist. Construct `keyColumns` from a validated schema map rather than raw interpolation. | ANA | Pending |
| RV-006 | Critical | Security | `backend/src/services/integration/metrologyParsers.js:209-260` | `parseVisionJson` creates an array from `body?.measurements` with no length bound. A malicious payload containing millions of measurements causes unbounded memory allocation and a DoS. | Add a `MAX_MEASUREMENTS` guard (suggest 50,000) and reject or truncate payloads that exceed it before array creation. | INT | Pending |
| RV-007 | Critical | Security | `frontend/vite.config.js:18-19` | CSP sets `'unsafe-inline'` for both `script-src` and `style-src`, completely negating XSS protections. Any injected inline script or style executes freely. | Remove `'unsafe-inline'`. Use nonces or hashes for any legitimate inline content. Refactor remaining inline styles to external stylesheets. | PLAT | Pending |
| RV-008 | Major | Security | `backend/src/middleware/authSession.js:5-35` | `ALLOW_LEGACY_ROLE_HEADER` defaults to enabled (truthy unless set to the string `"false"`). Any caller can impersonate any role, including Admin, by sending `x-user-role` and `x-user-id` headers. The frontend actively uses these headers in `api/client.js`. | Default to `false` (disabled). Require explicit opt-in. Migrate all tests to proper session-based auth. Remove header-based role from frontend API calls. | PLAT | Pending |
| RV-009 | Major | Security | `backend/src/routes/auth.js:196-234` | Login failure responses distinguish between `invalid_credentials`, `account_locked`, and `password_rotation_required`. An attacker can enumerate which usernames exist, which are locked, and which require rotation. | Return a single generic `invalid_credentials` response for all login failure cases. Log the specific reason server-side only. | PLAT | Pending |
| RV-010 | Major | Security | `backend/src/routes/auth.js:316-393` | Password rotation endpoint has no rate limiting, no lockout after failed attempts, and no exponential backoff. Rotation tokens are 64 hex chars (32 bytes) but in-memory — combined with missing rate limiting, brute-force is feasible. | Add per-token attempt counter. Lock after 3 failures. Log all attempts in the audit log. (Also see RV-004 for the underlying token storage issue.) | PLAT | Pending |
| RV-011 | Major | Security | `backend/src/services/platform/authLocalCredentials.js:61-71` | `verifyPassword` is called without confirming the underlying comparison is timing-safe. If not using `crypto.timingSafeEqual`, an attacker can infer password length/content through response timing differences. | Confirm or enforce that password comparison uses `crypto.timingSafeEqual`. Add a test that verifies timing characteristics are constant regardless of password length. | PLAT | Pending |
| RV-012 | Major | Security | `backend/src/services/platform/ssoAuth.js:31-37` | SSO proxy shared secret is not validated at module load time. If `AUTH_SSO_PROXY_SECRET` is unset or empty, the check silently passes (or always fails, depending on logic). No startup assertion guarantees a non-empty secret in production. | Assert at module load that the proxy secret is present and of minimum length when SSO is enabled. Fail startup rather than silently misconfiguring. | PLAT | Pending |
| RV-013 | Major | Performance | `backend/src/routes/records.js:343-466` | Record export iterates over records and fires separate queries per record for values, audit entries, comments, attachments, and quantity adjustments. For a 1000-record export this generates 5,000+ sequential queries. | Batch with `SELECT ... WHERE record_id = ANY($1)` for each related table, then join in application code. Eliminates N+1. | OPS | Pending |
| RV-014 | Major | Performance | `backend/src/services/quality/faiPackages.js:407-451` | `listFaiPackages` performs multi-table JOINs without result caching or cursor-based pagination. Called in a loop or under concurrent load this becomes an N+1 pattern at the service boundary. | Document the expected call pattern and add an explicit LIMIT guard. If called in a loop, use a batch-fetch approach instead. | QUAL | Pending |
| RV-015 | Major | Performance | `backend/src/routes/search.js:371-416` | Global search fires 6 parallel ILIKE queries per request (jobs, records, issues, audit, tools, users) with leading `%` wildcards, which cannot use indexes. No rate limiting on this endpoint. | Add rate limiting. Index searchable columns with PostgreSQL `tsvector` / GIN indexes. Apply per-entity result caps more aggressively. | PLAT | Pending |
| RV-016 | Major | Architecture | `backend/src/services/instructions.js:336-353` | `publishInstructionVersion` supersedes old published versions in one query, then publishes the new version in a separate query outside a transaction. A concurrent request between these two statements can leave the system with no published version. | Wrap supersede + publish in a single atomic `BEGIN/COMMIT` transaction with a `SELECT ... FOR UPDATE` lock held across both operations. | OPS | Pending |
| RV-017 | Major | Architecture | Multiple service files | Services inconsistently accept an optional `db` parameter for testability. `faiPackages.js` does; `instructions.js`, `martBuilder.js`, and others do not, requiring module-level mocking. This creates test friction and makes service boundaries opaque. | Standardize all service functions to accept an optional `db = { query: rootQuery }` parameter following the `faiPackages.js` pattern. | PLAT | Pending |
| RV-018 | Major | Code Quality | `backend/src/routes/dimensions.js`, `tools.js`, `search.js`, `imports.js`, `records.js` | `parsePositiveInteger`, `normalizeOptionalText`, `normalizeCalibrationDate`, and similar helpers are implemented nearly identically across 5+ route files. Any rule change requires synchronized updates. | Extract into a single `backend/src/utils/validators.js` module and import from all routes. | PLAT | Pending |
| RV-019 | Major | Code Quality | `frontend/src/domains/jobflow/InspectFlowApp.jsx` | InspectFlowApp.jsx is a ~432KB monolithic file handling job workflows, instruction acknowledgments, analytics dashboards, FAI orchestration, and more in a single component with hundreds of utility functions. It is essentially untestable and impossible to navigate. | Decompose into focused domain components: `JobWorkflow.jsx`, `InstructionWorkflow.jsx`, `AnalyticsDashboard.jsx`. Extract utility functions to a `frontend/src/utils/` directory. | OPS | Pending |
| RV-020 | Major | Code Quality | `frontend/src/domains/jobflow/InspectFlowApp.jsx:1055,1590,1790,3325,3331,5906,6731` | Extensive use of `.catch(() => {})` (empty catch) silently swallows failures on version loading, instruction loading, job unlock, workforce analytics, SPC analysis, and part updates. Users receive no feedback. | Implement a consistent error notification pattern (toast or error boundary). At minimum, log errors and display a generic failure message. Remove all empty catch handlers. | OPS | Pending |
| RV-021 | Major | Code Quality | `backend/src/routes/auth.js:619-666` | `POST /api/auth/reset-default-passwords` resets ALL active users' passwords in a single request with no confirmation token, no pagination limit, and no per-user approval. In a system with thousands of users this is a one-shot lockout. | Require the caller to pass explicit user IDs (max 50 per call). Emit an audit event per reset. Add a confirmation step or require a separate "dry-run" parameter. | PLAT | Pending |
| RV-022 | Major | Code Quality | `frontend/src/domains/jobflow/mappers.js:9-35`, `InspectFlowApp.jsx:348-372`, `backend/src/revisions.js:10-38` | Revision code conversion logic (`revisionCodeToIndex`, `revisionIndexToCode`, `nextRevisionCode`) is duplicated across three files with slightly diverging implementations. A bug fix in one location will not be reflected in the others. | Create `inspectflow/shared/revisions.js` (or a `backend` utility module) and import from both frontend and backend. Add a shared unit test. | PLAT | Pending |
| RV-023 | Major | Code Quality | `backend/src/routes/users.js:15,70` | `SELECT *` on the users table returns all columns in every query. Any future column addition (e.g., a sensitive field) is automatically exposed through the API without a code change. | Use explicit column lists: `SELECT id, name, role, active, created_at FROM users`. Never return password-related columns. | PLAT | Pending |
| RV-024 | Minor | Security | `backend/src/routes/auth.js:193-221` | `recordAuthEvent()` accepts an unvalidated `metadata` object. Callers could accidentally (or maliciously) include passwords or PII in audit metadata, persisting them to the audit log indefinitely. | Document and enforce that `metadata` must not contain passwords or sensitive data. Validate structure or accept only a typed allowlist of fields. | PLAT | Pending |
| RV-025 | Minor | Security | `backend/src/routes/users.js:12-28` | No restriction prevents an Admin from creating another Admin account. There is no approval workflow or audit event specifically flagging privileged role assignments. | Emit a distinct audit event for Admin role assignments. Consider requiring a secondary confirmation for Admin creation. | PLAT | Pending |
| RV-026 | Minor | Security | `backend/src/auth.js:79-84` | Password strength validation is length-only (default min 8 chars). Passwords like `12345678` or `password` pass. No complexity requirements, no common-pattern rejection. | Enforce character variety (upper, lower, digit, symbol). Optionally integrate `zxcvbn` for strength estimation. Document the enforced policy. | PLAT | Pending |
| RV-027 | Minor | Performance | `backend/src/routes/audit.js:184-209` | `runAuditSummary()` runs `GROUP BY` queries without a `LIMIT` clause. An actor with many unique field values can trigger memory-intensive aggregation that returns an unbounded result set. | Add `LIMIT 1000` to GROUP BY queries. Paginate summary results. Add index on grouped columns. | PLAT | Pending |
| RV-028 | Minor | Performance | `backend/src/routes/audit.js:229-250` | CSV export builds the entire response as a string in memory via `[header, ...rows.map(rowToCsvLine)].join("\n")`. Under concurrent large exports this can exhaust memory. | Stream the response using Node's `stream.Readable` or pipe rows directly to `res` with `res.write()`. | PLAT | Pending |
| RV-029 | Minor | Performance | `backend/src/services/analytics/spcAnalysis.js:253-301` | SPC query is constructed with up to 7+ filter parameters and LATERAL subqueries without a configured query timeout. A pathologically large dataset with multiple filters can run indefinitely and block DB connections. | Add a PostgreSQL `statement_timeout` (e.g., 30s) for analytics queries. Document max expected data size. | ANA | Pending |
| RV-030 | Minor | Architecture | `backend/src/routes/tools.js:237-258` | The `DELETE /tools/:id` endpoint performs a soft delete (sets `active=false, visible=false`) but is named and documented as DELETE. Callers expecting RFC-standard DELETE semantics receive unexpected behavior. | Rename to `POST /tools/:id/deactivate` or document soft-delete clearly in the API contract. | OPS | Pending |
| RV-031 | Minor | Architecture | `backend/src/routes/audit.js:253-260` | `GET /audit/summary` is accessible to any user with `view_records` capability, exposing system-wide change frequency and user activity patterns to non-admin users. | Gate behind an additional `admin` or dedicated `view_audit_summary` capability. | PLAT | Pending |
| RV-032 | Minor | Code Quality | `frontend/src/domains/jobflow/mappers.js:37-42`, `InspectFlowApp.jsx:335-340` | `fmtTs` (timestamp formatter) and `normalizeOpNumber` are defined identically in both `mappers.js` and `InspectFlowApp.jsx`. Same duplication issue as RV-022 but at the frontend level only. | Export from `mappers.js` only. Remove the duplicate definitions in `InspectFlowApp.jsx` and import instead. | OPS | Pending |
| RV-033 | Minor | Code Quality | `backend/src/routes/tools.js:7-11`, `dimensions.js:144-175` | `normalizeCalibrationDate` uses a regex that accepts calendar-impossible dates (e.g., `2026-02-30`, `2025-13-01`). | Validate with `Date.parse()` after the regex check and confirm the result is not `NaN`. | OPS | Pending |
| RV-034 | Minor | Code Quality | `backend/src/routes/imports.js:68-117` | CSV parser silently fills missing columns with empty string (`val ?? ""`). A row with fewer columns than headers imports with invisible blank fields; no warning is returned to the caller. | Validate row column count against header count. Return a row-level error or warning if counts diverge. | INT | Pending |
| RV-035 | Minor | Code Quality | `backend/src/services/analytics/martBuilder.js:500-532` | Error response shapes vary across services: some return `{ error: "code" }`, some `{ ok: false, error: { code, message } }`, and some throw. No consistent contract. | Define a single error envelope shape and apply it consistently across all services and routes. Document in a contract spec. | ANA | Pending |
| RV-036 | Minor | Code Quality | `backend/src/services/instructions.js:459-530` | `acknowledgeInstructionForContext` accepts `actorRole` as a passed-in parameter from the caller without validating it against the authenticated session role. A miscoding upstream could persist an escalated role in the audit record. | Derive `actorRole` exclusively from the authenticated session context, not from caller parameters. | OPS | Pending |
| RV-037 | Minor | Test Coverage | `backend/test/auth.test.js:121-125` | `afterEach` cleanup sets `active=false` instead of deleting test users, leaving orphaned rows. Over many test runs the DB accumulates unlimited test data. The comment acknowledges this as a workaround. | Use transactional test fixtures (begin + rollback per test) or a dedicated test DB wiped per suite run. | PLAT | Pending |
| RV-038 | Minor | Test Coverage | `frontend/tests/mocked.smoke.spec.js:15-20,47-62` | Mock test data uses hardcoded IDs (`id: 1`, `"t01"`–`"t14"`). Tests will silently pass with wrong data if IDs drift from seed data. | Use a test data factory pattern. Assert on names/labels rather than internal IDs. | PLAT | Pending |
| RV-039 | Minor | Documentation | `docs/data-model.md:1-80` | data-model.md documents approximately 25% of actual tables. Missing: `auth_local_credentials`, `role_capabilities`, `platform_entitlements`, `part_setup_revisions`, `operation_instruction_sets`, `operation_instruction_versions`, `work_centers`, and all audit/attachment tables. New developers cannot understand the data model from this document. | Generate data model docs from `schema.sql` automatically (e.g., via `pgdoc` or a simple script). Or maintain a comprehensive table inventory manually. | PLAT | Pending |
| RV-040 | Minor | Documentation | `backend/src/services/analytics/martBuilder.js` (top) | The mart builder references multiple contract IDs (`ANA-KPI-v3`, `BL-071-spc-v1`) throughout but provides no documentation of what each contract guarantees, what fields are required, or how versioning works. | Add a `CONTRACTS.md` or section in `stream-contracts-ana.md` documenting each analytics contract schema, invariants, and version history. | ANA | Pending |
| RV-041 | Minor | Documentation | `frontend/src/domains/jobflow/InspectFlowApp.jsx:335-340`, `backend/src/revisions.js` | Timestamps are formatted and displayed without an explicit timezone indicator. In multi-site or multi-timezone deployments, operators cannot determine what timezone a timestamp represents. | Enforce UTC storage at the DB layer. Display with explicit timezone suffix (e.g., `"2026-03-26 14:30 UTC"`). Add timezone to the `fmtTs` formatter output. | OPS | Pending |
| RV-042 | Suggestion | Security | `backend/src/index.js` | Security headers are set manually but could drift over time. Helmet.js covers all OWASP-recommended headers and stays updated. | Add `helmet()` middleware to replace manual header configuration. | PLAT | Pending |
| RV-043 | Suggestion | Code Quality | Multiple route files | No schema-based request validation library. Each route validates manually with ad hoc checks. | Evaluate `zod` or `joi` for schema-based validation. Centralizes rules and generates better error messages. | PLAT | Pending |
| RV-044 | Suggestion | Performance | `backend/src/routes/audit.js:229-250` | Large CSV exports build the full response in memory. Streaming would reduce memory footprint. (Extends RV-028.) | Implement `res.write()` streaming approach as a follow-on to RV-028. | PLAT | Pending |
| RV-045 | Suggestion | Performance | `backend/src/routes/search.js` | ILIKE with `%` prefix is a full table scan. PostgreSQL `tsvector` + GIN indexes would make full-text search orders of magnitude faster at scale. | Add a `tsvector` column (or computed index) on high-cardinality search targets (job names, part names, user names). Benchmark before and after. | PLAT | Pending |

---

## Disposition Summary
- Total findings: 45
- Approved (→ BL-###): 26 — BL-147 through BL-172
- Duplicate (existing coverage): 19 — RV-002→BL-125, RV-003→BL-126, RV-005→BL-086, RV-007→BL-145, RV-008→BL-127, RV-012→BL-138, RV-017→BL-088, RV-018→BL-088, RV-019→BL-093, RV-023→BL-136, RV-026→BL-144, RV-032→BL-093, RV-035→BL-087, RV-037→BL-092, RV-038→BL-093, RV-042→BL-130, RV-043→BL-088, RV-044→BL-163, RV-045→BL-091
- Deferred: 0
- Rejected: 0

## Approved Finding → BL-### Map
| RV | BL | Severity |
|----|----|----------|
| RV-001 | BL-147 | Critical |
| RV-004 | BL-148 | Critical |
| RV-006 | BL-149 | Critical |
| RV-009 | BL-150 | Major |
| RV-010 | BL-151 | Major |
| RV-011 | BL-152 | Major |
| RV-013 | BL-153 | Major |
| RV-014 | BL-154 | Major |
| RV-015 | BL-155 | Major |
| RV-016 | BL-156 | Major |
| RV-020 | BL-157 | Major |
| RV-021 | BL-158 | Major |
| RV-022 | BL-159 | Major |
| RV-024 | BL-160 | Minor |
| RV-025 | BL-161 | Minor |
| RV-027 | BL-162 | Minor |
| RV-028 | BL-163 | Minor |
| RV-029 | BL-164 | Minor |
| RV-030 | BL-165 | Minor |
| RV-031 | BL-166 | Minor |
| RV-033 | BL-167 | Minor |
| RV-034 | BL-168 | Minor |
| RV-036 | BL-169 | Minor |
| RV-039 | BL-170 | Minor |
| RV-040 | BL-171 | Minor |
| RV-041 | BL-172 | Minor |
