import { Router } from "express";
import {
  createTemplateHandler,
  getTemplateHandler,
  listTemplatesHandler,
} from "../controllers/processTemplates.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const processTemplatesRouter = Router();

processTemplatesRouter.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  listTemplatesHandler
);
processTemplatesRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  createTemplateHandler
);
processTemplatesRouter.get(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  getTemplateHandler
);
