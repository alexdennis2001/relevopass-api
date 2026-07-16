import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { guid } from "../lib/validators";
import { toHttpError } from "../lib/workflowErrors";
import { completeStep, rejectStep } from "../services/processes.service";

const idParamSchema = z.object({
  id: guid,
});

export async function completeStepHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const detail = await completeStep(id, req.user!.sub);
    res.json(detail);
  } catch (err) {
    next(toHttpError(err) ?? err);
  }
}

export async function rejectStepHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const detail = await rejectStep(id, req.user!.sub);
    res.json(detail);
  } catch (err) {
    next(toHttpError(err) ?? err);
  }
}
