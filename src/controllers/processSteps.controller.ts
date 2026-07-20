import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { guid } from "../lib/validators";
import { toHttpError } from "../lib/workflowErrors";
import { completeStep, rejectStep } from "../services/processes.service";

const idParamSchema = z.object({
  id: guid,
});

const rejectSchema = z.object({
  note: z.string().trim().min(1, "Se requiere una nota").max(1000),
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
    const { note } = rejectSchema.parse(req.body);
    const detail = await rejectStep(id, req.user!.sub, note);
    res.json(detail);
  } catch (err) {
    next(toHttpError(err) ?? err);
  }
}
