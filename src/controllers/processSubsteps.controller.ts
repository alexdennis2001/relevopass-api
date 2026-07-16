import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { guid } from "../lib/validators";
import { toHttpError } from "../lib/workflowErrors";
import { completeSubstep } from "../services/processes.service";

const idParamSchema = z.object({
  id: guid,
});

export async function completeSubstepHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const detail = await completeSubstep(id, req.user!.sub);
    res.json(detail);
  } catch (err) {
    next(toHttpError(err) ?? err);
  }
}
