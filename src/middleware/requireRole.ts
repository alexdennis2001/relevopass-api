import { NextFunction, Request, Response } from "express";
import { AuthTokenPayload } from "../lib/jwt";
import { HttpError } from "./errorHandler";

export function requireRole(...roles: AuthTokenPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "Forbidden"));
    }
    next();
  };
}
