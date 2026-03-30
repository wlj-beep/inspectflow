import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
import importsRouter from "./routes/imports.js";
import { startImportScheduler } from "./routes/imports.js";
import toolLocationsRouter from "./routes/toolLocations.js";
import authRouter from "./routes/auth.js";
import { attachAuthSession } from "./middleware/authSession.js";
import analyticsRouter from "./routes/analytics.js";
import technicalOpsRouter from "./routes/technicalOps.js";

dotenv.config();

function parseCorsOrigin(rawOrigin) {
  const raw = String(rawOrigin || "").trim();
  if (!raw) return false;
  if (!raw.includes(",")) return raw;
  const allowlist = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.length ? allowlist : false;
}

function validateStartupEnv() {
  if (process.env.NODE_ENV === "test") return;
  const required = ["DATABASE_URL", "AUTH_TOKEN_PEPPER", "FRONTEND_ORIGIN"];
  const missing = required.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required env var(s): ${missing.join(", ")}`);
  }
}

validateStartupEnv();

const app = express();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet());
app.use(cors({
  origin: parseCorsOrigin(process.env.FRONTEND_ORIGIN),
  credentials: true
}));
app.use(express.json());
app.use(attachAuthSession);
app.use("/api/auth/login", authLimiter);

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "inspectflow-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/technical-ops", technicalOpsRouter);
app.use("/api/users", usersRouter);
app.use("/api/tools", toolsRouter);
app.use("/api/parts", partsRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/dimensions", dimensionsRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/records", recordsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/issues", issuesRouter);
app.use("/api/imports", importsRouter);
app.use("/api/tool-locations", toolLocationsRouter);

app.use((err, req, res, next) => {
  console.error(err);
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
