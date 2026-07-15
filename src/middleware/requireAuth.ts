import { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../lib/jwt";
import { HttpError } from "./errorHandler";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.token;

  if (!token) {
    return next(new HttpError(401, "Not authenticated"));
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired session"));
  }
}
