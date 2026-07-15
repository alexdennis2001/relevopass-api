import { Router } from "express";
import {
  login,
  logout,
  me,
  register,
  registerAdmin,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/requireAuth";
import { createAuthRateLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/register", createAuthRateLimiter(), register);
authRouter.post("/register-admin", createAuthRateLimiter(), registerAdmin);
authRouter.post("/login", createAuthRateLimiter(), login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
