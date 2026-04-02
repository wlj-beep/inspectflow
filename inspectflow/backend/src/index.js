import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { startImportSchedulerWorker } from "./services/integration/schedulerWorker.js";
import { attachAuthSession } from "./middleware/authSession.js";
import { registerAppRoutes } from "./routes/registerAppRoutes.js";

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

registerAppRoutes(app);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

const port = process.env.PORT || 4000;
if (process.env.NODE_ENV !== "test") {
  const runEmbeddedScheduler = String(process.env.IMPORT_SCHEDULER_EMBEDDED || "").toLowerCase() === "true";
  if (runEmbeddedScheduler) {
    startImportSchedulerWorker();
  }
  app.listen(port, () => {
    console.log(`InspectFlow API running on :${port}`);
  });
}

export default app;
