import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { guid } from "../lib/validators";
import { HttpError } from "../middleware/errorHandler";
import { toHttpError } from "../lib/workflowErrors";
import {
  createTemplateFromProcess,
  getTemplateById,
  listTemplates,
} from "../services/processTemplates.service";

const createTemplateSchema = z.object({
  processId: guid,
  name: z.string().trim().min(1).max(200),
});

export async function createTemplateHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { processId, name } = createTemplateSchema.parse(req.body);
    const template = await createTemplateFromProcess(
      processId,
      name,
      req.user!.sub
    );
    res.status(201).json(template);
  } catch (err) {
    next(toHttpError(err) ?? err);
  }
}

export async function listTemplatesHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const templates = await listTemplates();
    res.json(templates);
  } catch (err) {
    next(err);
  }
}

const idParamSchema = z.object({
  id: guid,
});

export async function getTemplateHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const detail = await getTemplateById(id);
    if (!detail) {
      throw new HttpError(404, "Plantilla no encontrada");
    }
    res.json(detail);
  } catch (err) {
    next(toHttpError(err) ?? err);
  }
}
