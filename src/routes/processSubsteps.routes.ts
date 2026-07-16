import { Router } from "express";
import {
  completeSubstepHandler,
  rejectSubstepHandler,
} from "../controllers/processSubsteps.controller";
import { requireAuth } from "../middleware/requireAuth";

export const processSubstepsRouter = Router();

processSubstepsRouter.post(
  "/:id/complete",
  requireAuth,
  completeSubstepHandler
);
processSubstepsRouter.post(
  "/:id/reject",
  requireAuth,
  rejectSubstepHandler
);
