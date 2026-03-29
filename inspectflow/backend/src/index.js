import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import usersRouter from "./routes/users.js";
import toolsRouter from "./routes/tools.js";
import partsRouter from "./routes/parts.js";
import operationsRouter from "./routes/operations.js";
import dimensionsRouter from "./routes/dimensions.js";
import jobsRouter from "./routes/jobs.js";
import recordsRouter from "./routes/records.js";
import auditRouter from "./routes/audit.js";
import rolesRouter from "./routes/roles.js";
import sessionsRouter from "./routes/sessions.js";
import issuesRouter from "./routes/issues.js";
import searchRouter from "./routes/search.js";
import importsRouter from "./routes/imports.js";
import { startImportScheduler } from "./routes/imports.js";
import toolLocationsRouter from "./routes/toolLocations.js";
import authRouter from "./routes/auth.js";
import { attachAuthSession } from "./middleware/authSession.js";
import analyticsRouter from "./routes/analytics.js";
import technicalOpsRouter from "./routes/technicalOps.js";
import extensionsRouter from "./routes/extensions.js";
import partnerConnectorsRouter from "./routes/partnerConnectors.js";
import edgeSyncRouter from "./routes/edgeSync.js";
import qualityRouter from "./routes/quality.js";
import ncrRouter from "./routes/ncr.js";
import capaRouter from "./routes/capa.js";
import qmsExpansionRouter from "./routes/qmsExpansion.js";
import calibrationLabRouter from "./routes/calibrationLab.js";
import reportTemplatesRouter from "./routes/reportTemplates.js";
import msaRouter from "./routes/msa.js";
import ppapRouter from "./routes/ppap.js";
import collectorRouter from "./routes/collector.js";
import formBuilderRouter from "./routes/formBuilder.js";
import { resolveLegacyPartnerSurfaceEnabled } from "./services/integration/legacySurfaces.js";
import portalRouter from "./routes/portal.js";

dotenv.config();

function parseCorsOrigins(rawOrigins) {
  return String(rawOrigins || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function validateRuntimeConfig() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const isProduction = nodeEnv === "production";
  const isTest = nodeEnv === "test";
  const hasPepper = String(process.env.AUTH_TOKEN_PEPPER || "").trim().length > 0;
  const hasFrontendOrigin = parseCorsOrigins(process.env.FRONTEND_ORIGIN).length > 0;
  const legacyHeaderEnabled = String(process.env.ALLOW_LEGACY_ROLE_HEADER || "").trim().toLowerCase() === "true";
  const allowLegacySsoEnv = String(process.env.AUTH_ALLOW_LEGACY_SSO_ENV || "").trim().toLowerCase() === "true";
  const localLoginConfigured = String(process.env.AUTH_LOCAL_LOGIN_ENABLED || "").trim().toLowerCase();
  const localLoginEnabled = localLoginConfigured
    ? localLoginConfigured === "true"
    : !isProduction;
  const ssoEnabled = String(process.env.AUTH_SSO_ENABLED || "").trim().toLowerCase() === "true";
  const oidcIssuerUrl = String(process.env.AUTH_OIDC_ISSUER_URL || "").trim();
  const oidcClientId = String(process.env.AUTH_OIDC_CLIENT_ID || "").trim();
  const hasDatabaseUrl = String(process.env.DATABASE_URL || "").trim().length > 0;
  const authCookieSecure = String(process.env.AUTH_COOKIE_SECURE || "").trim().toLowerCase();
  const authCookieSecureConfigured = authCookieSecure === "true" || authCookieSecure === "false";
  const legacySsoProxySecretConfigured = String(process.env.SSO_PROXY_SECRET || "").trim().length > 0;
  const legacySsoSecretHeaderConfigured = String(process.env.SSO_PROXY_SECRET_HEADER || "").trim().length > 0;

  if (!isTest && !hasDatabaseUrl) {
    throw new Error("DATABASE_URL is required outside test runtime.");
  }

  if (!isTest && !hasFrontendOrigin) {
    throw new Error("FRONTEND_ORIGIN is required outside test runtime.");
  }
  if (!isTest && !hasPepper) {
    throw new Error("AUTH_TOKEN_PEPPER is required outside test runtime.");
  }
  if (!isTest && !authCookieSecureConfigured) {
    throw new Error("AUTH_COOKIE_SECURE must be explicitly set to true or false outside test runtime.");
  }
  if (isProduction && authCookieSecure !== "true") {
    throw new Error("AUTH_COOKIE_SECURE must be true in production.");
  }
  if (legacyHeaderEnabled && nodeEnv !== "test") {
    throw new Error("ALLOW_LEGACY_ROLE_HEADER=true is only permitted when NODE_ENV=test.");
  }
  if (isProduction && !ssoEnabled) {
    throw new Error("AUTH_SSO_ENABLED must be true in production (BL-082 OIDC standardization).");
  }
  if (!isTest && ssoEnabled && (!oidcIssuerUrl || !oidcClientId)) {
    throw new Error("AUTH_OIDC_ISSUER_URL and AUTH_OIDC_CLIENT_ID are required when AUTH_SSO_ENABLED=true outside test runtime.");
  }
  if (!isTest && localLoginEnabled && ssoEnabled) {
    throw new Error("AUTH_LOCAL_LOGIN_ENABLED must be false when AUTH_SSO_ENABLED=true outside test runtime.");
  }
  if (!allowLegacySsoEnv && (legacySsoProxySecretConfigured || legacySsoSecretHeaderConfigured)) {
    throw new Error("Legacy SSO_* env keys are deprecated. Use AUTH_SSO_* keys or set AUTH_ALLOW_LEGACY_SSO_ENV=true for temporary migration.");
  }
}

validateRuntimeConfig();

const app = express();
const jsonBodyLimit = process.env.API_JSON_BODY_LIMIT || "2mb";
const allowedOrigins = parseCorsOrigins(process.env.FRONTEND_ORIGIN);
const legacyPartnerIntegrationSurfaceEnabled = resolveLegacyPartnerSurfaceEnabled(
  process.env.INTEGRATION_LEGACY_PARTNER_SURFACES,
  process.env.NODE_ENV
);
const API_VERSION = "v1";

function mountApiSurface(basePath) {
  app.use(`${basePath}/auth`, authRouter);
  app.use(`${basePath}/analytics`, analyticsRouter);
  app.use(`${basePath}/technical-ops`, technicalOpsRouter);
  if (legacyPartnerIntegrationSurfaceEnabled) {
    app.use(`${basePath}/extensions`, extensionsRouter);
    app.use(`${basePath}/partner-connectors`, partnerConnectorsRouter);
  } else {
    const legacyIntegrationDisabledHandler = (req, res) => {
      res.status(404).json({
        error: "legacy_integration_surface_disabled",
        detail: "Set INTEGRATION_LEGACY_PARTNER_SURFACES=true to temporarily re-enable extensions and partner connector kit endpoints."
      });
    };
    app.use(`${basePath}/extensions`, legacyIntegrationDisabledHandler);
    app.use(`${basePath}/partner-connectors`, legacyIntegrationDisabledHandler);
  }
  app.use(`${basePath}/edge-sync`, edgeSyncRouter);
  app.use(`${basePath}/quality`, qualityRouter);
  app.use(`${basePath}/ncr`, ncrRouter);
  app.use(`${basePath}/capa`, capaRouter);
  app.use(`${basePath}/qms`, qmsExpansionRouter);
  app.use(`${basePath}/calibration`, calibrationLabRouter);
  app.use(`${basePath}/report-templates`, reportTemplatesRouter);
  app.use(`${basePath}/quality/msa`, msaRouter);
  app.use(`${basePath}/quality/ppap`, ppapRouter);
  app.use(`${basePath}/users`, usersRouter);
  app.use(`${basePath}/tools`, toolsRouter);
  app.use(`${basePath}/parts`, partsRouter);
  app.use(`${basePath}/operations`, operationsRouter);
  app.use(`${basePath}/dimensions`, dimensionsRouter);
  app.use(`${basePath}/jobs`, jobsRouter);
  app.use(`${basePath}/records`, recordsRouter);
  app.use(`${basePath}/audit`, auditRouter);
  app.use(`${basePath}/roles`, rolesRouter);
  app.use(`${basePath}/sessions`, sessionsRouter);
  app.use(`${basePath}/issues`, issuesRouter);
  app.use(`${basePath}/search`, searchRouter);
  app.use(`${basePath}/imports`, importsRouter);
  app.use(`${basePath}/tool-locations`, toolLocationsRouter);
  app.use(`${basePath}/collector`, collectorRouter);
  app.use(`${basePath}/form-builder`, formBuilderRouter);
  app.use(`${basePath}/portal`, portalRouter);
}

app.disable("x-powered-by");
app.use((req, res, next) => {
  const requestIsSecure = req.secure || String(req.header("x-forwarded-proto") || "").toLowerCase() === "https";
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  // Prevent API responses from being stored in intermediate caches or browser cache.
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  if (requestIsSecure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(cors({
  origin(origin, callback) {
    // No Origin header means a server-to-server or same-origin request; CORS
    // enforcement does not apply — allow it explicitly rather than via a wildcard.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("cors_origin_not_allowed"));
  },
  credentials: true
}));
app.use(express.json({ limit: jsonBodyLimit }));
app.use(attachAuthSession);
app.use((req, res, next) => {
  const requestPath = String(req.originalUrl || req.path || "");
  if (requestPath.startsWith(`/api/${API_VERSION}`)) {
    res.setHeader("X-API-Version", API_VERSION);
  } else if (requestPath.startsWith("/api/")) {
    res.setHeader("X-API-Compatibility-Alias", `/api/${API_VERSION}`);
  }
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "inspectflow-backend" });
});

mountApiSurface(`/api/${API_VERSION}`);
mountApiSurface("/api");

app.use((err, req, res, next) => {
  console.error(err);
  if (err?.message === "cors_origin_not_allowed") {
    return res.status(403).json({ error: "cors_origin_not_allowed" });
  }
  // Map PostgreSQL constraint violation codes to semantic 4xx responses.
  // Never echo err.detail or err.message to callers — they may contain user data.
  const constraintErrorResponse = {
    23505: { status: 409, error: "conflict", detail: "duplicate_value" },
    23503: { status: 409, error: "conflict", detail: "reference_not_found" },
    23502: { status: 422, error: "validation_error", detail: "required_field_missing" },
    23514: { status: 422, error: "validation_error", detail: "constraint_check_failed" }
  }[String(err?.code || "")];
  if (constraintErrorResponse) {
    return res.status(constraintErrorResponse.status).json({
      error: constraintErrorResponse.error,
      detail: constraintErrorResponse.detail
    });
  }
  res.status(500).json({ error: "server_error" });
});

const port = process.env.PORT || 4000;
if (process.env.NODE_ENV !== "test") {
  startImportScheduler();
  app.listen(port, () => {
    console.log(`InspectFlow API running on :${port}`);
  });
}

export default app;
