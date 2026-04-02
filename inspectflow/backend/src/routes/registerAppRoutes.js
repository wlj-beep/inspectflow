import usersRouter from "./users.js";
import toolsRouter from "./tools.js";
import partsRouter from "./parts.js";
import operationsRouter from "./operations.js";
import dimensionsRouter from "./dimensions.js";
import jobsRouter from "./jobs.js";
import recordsRouter from "./records.js";
import auditRouter from "./audit.js";
import rolesRouter from "./roles.js";
import sessionsRouter from "./sessions.js";
import issuesRouter from "./issues.js";
import importsRouter from "./imports.js";
import toolLocationsRouter from "./toolLocations.js";
import authRouter from "./auth.js";
import analyticsRouter from "./analytics.js";
import technicalOpsRouter from "./technicalOps.js";
import qualityRouter from "./quality.js";
import proofCenterRouter from "./proofCenter.js";
import integrationEcosystemRouter from "./integrationEcosystem.js";

function registerPlatRoutes(app) {
  app.use("/api/auth", authRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/roles", rolesRouter);
  app.use("/api/technical-ops", technicalOpsRouter);
}

function registerOpsRoutes(app) {
  app.use("/api/users", usersRouter);
  app.use("/api/tools", toolsRouter);
  app.use("/api/parts", partsRouter);
  app.use("/api/operations", operationsRouter);
  app.use("/api/dimensions", dimensionsRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/records", recordsRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/issues", issuesRouter);
  app.use("/api/tool-locations", toolLocationsRouter);
}

function registerIntRoutes(app) {
  app.use("/api/imports", importsRouter);
}

function registerAnaRoutes(app) {
  app.use("/api/analytics", analyticsRouter);
}

function registerQualityRoutes(app) {
  app.use("/api/quality", qualityRouter);
}

function registerProofRoutes(app) {
  app.use("/api/proof-center", proofCenterRouter);
}

function registerIntegrationRoutes(app) {
  app.use("/api/integration/ecosystem", integrationEcosystemRouter);
}

export function registerAppRoutes(app) {
  registerPlatRoutes(app);
  registerOpsRoutes(app);
  registerIntRoutes(app);
  registerAnaRoutes(app);
  registerQualityRoutes(app);
  registerProofRoutes(app);
  registerIntegrationRoutes(app);
}
