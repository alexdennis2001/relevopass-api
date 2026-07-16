import { Router } from "express";
import {
  completeStepHandler,
  rejectStepHandler,
} from "../controllers/processSteps.controller";
import { requireAuth } from "../middleware/requireAuth";

export const processStepsRouter = Router();

processStepsRouter.post("/:id/complete", requireAuth, completeStepHandler);
processStepsRouter.post("/:id/reject", requireAuth, rejectStepHandler);
