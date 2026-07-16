import { NextFunction, Request, Response } from "express";
import { guid } from "../lib/validators";
import { getProcessStakeholderAccess } from "../services/processes.service";
import { HttpError } from "./errorHandler";

export async function requireProcessStakeholder(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const processId = guid.parse(req.params.id);
    const access = await getProcessStakeholderAccess(
      processId,
      req.user!.sub
    );

    if (access === "not_found") {
      return next(new HttpError(404, "Process not found"));
    }
    if (access === "forbidden") {
      return next(new HttpError(403, "Forbidden"));
    }
    next();
  } catch (err) {
    next(err);
  }
}
