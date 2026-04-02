import dotenv from "dotenv";
import {
  startImportSchedulerWorker,
  stopImportSchedulerWorker
} from "../services/integration/schedulerWorker.js";

dotenv.config();

if (process.env.NODE_ENV === "test") {
  console.log("Import scheduler worker skipped in test mode.");
  process.exit(0);
}

let shuttingDown = false;

function handleShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Import scheduler worker stopping (${signal}).`);
  stopImportSchedulerWorker();
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

startImportSchedulerWorker();
console.log("Import scheduler worker started.");
