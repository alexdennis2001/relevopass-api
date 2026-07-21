import { Router } from "express";
import {
  createProcessHandler,
  deleteProcessHandler,
  getMyProcessesHandler,
  getProcessEventsHandler,
  getProcessHandler,
  listProcessesHandler,
  startProcessHandler,
  syncProcessStepsHandler,
} from "../controllers/processes.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireProcessStakeholder } from "../middleware/requireProcessStakeholder";
import { requireRole } from "../middleware/requireRole";

export const processesRouter = Router();

processesRouter.get("/", requireAuth, requireRole("ADMIN"), listProcessesHandler);
processesRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  createProcessHandler
);
// Must come before "/:id" — Express matches routes in registration order,
// so "/:id" would otherwise swallow "/mine" as if "mine" were a process id.
processesRouter.get("/mine", requireAuth, getMyProcessesHandler);
processesRouter.get(
  "/:id",
  requireAuth,
  requireProcessStakeholder,
  getProcessHandler
);
processesRouter.post(
  "/:id/start",
  requireAuth,
  requireRole("ADMIN"),
  startProcessHandler
);
processesRouter.put(
  "/:id/steps",
  requireAuth,
  requireRole("ADMIN"),
  syncProcessStepsHandler
);
processesRouter.get(
  "/:id/events",
  requireAuth,
  requireProcessStakeholder,
  getProcessEventsHandler
);
processesRouter.delete("/:id", requireAuth, deleteProcessHandler);
