import { Router } from "express";
import {
  forgotPassword,
  login,
  logout,
  me,
  register,
  registerAdmin,
  resetPassword,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/requireAuth";
import { createAuthRateLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/register", createAuthRateLimiter(), register);
authRouter.post("/register-admin", createAuthRateLimiter(), registerAdmin);
authRouter.post("/login", createAuthRateLimiter(), login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
authRouter.post(
  "/forgot-password",
  createAuthRateLimiter(),
  forgotPassword
);
authRouter.post(
  "/reset-password",
  createAuthRateLimiter(),
  resetPassword
);
