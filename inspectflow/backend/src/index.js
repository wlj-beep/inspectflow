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
import importsRouter from "./routes/imports.js";
import { startImportScheduler } from "./routes/imports.js";
import toolLocationsRouter from "./routes/toolLocations.js";
import authRouter from "./routes/auth.js";
import { attachAuthSession } from "./middleware/authSession.js";
import analyticsRouter from "./routes/analytics.js";

dotenv.config();

const app = express();
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(attachAuthSession);

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "inspectflow-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/analytics", analyticsRouter);
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
