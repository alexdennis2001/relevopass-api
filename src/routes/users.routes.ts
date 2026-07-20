import { Router } from "express";
import {
  listUsersHandler,
  resetPasswordHandler,
} from "../controllers/users.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const usersRouter = Router();

usersRouter.get("/", requireAuth, requireRole("ADMIN"), listUsersHandler);
usersRouter.post(
  "/:id/reset-password",
  requireAuth,
  requireRole("ADMIN"),
  resetPasswordHandler
);
