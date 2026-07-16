import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { guid } from "../lib/validators";
import { HttpError } from "../middleware/errorHandler";
import { toHttpError } from "../lib/workflowErrors";
import {
  createProcess,
  getMyProcesses,
  getProcessById,
  getProcessEvents,
  InvalidAssigneeError,
  startProcess,
  syncProcessSteps,
} from "../services/processes.service";

const substepSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  assigneeUserId: guid,
});

const stepSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  assigneeUserId: guid,
  substeps: z.array(substepSchema).default([]),
});

const createProcessSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  steps: z.array(stepSchema).min(1),
});

export async function createProcessHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = createProcessSchema.parse(req.body);

    const processId = await createProcess({
      name: body.name,
      description: body.description,
      createdByUserId: req.user!.sub,
      steps: body.steps,
    });

    const detail = await getProcessById(processId);
    res.status(201).json(detail);
  } catch (err) {
    if (err instanceof InvalidAssigneeError) {
      return next(new HttpError(400, err.message));
    }
    next(err);
  }
}

const idParamSchema = z.object({
  id: guid,
});

export async function getProcessHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const detail = await getProcessById(id);

    if (!detail) {
      return next(new HttpError(404, "Process not found"));
    }

    res.json(detail);
  } catch (err) {
    next(err);
  }
}

export async function startProcessHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const detail = await startProcess(id, req.user!.sub);
    res.json(detail);
  } catch (err) {
    next(toHttpError(err) ?? err);
  }
}

export async function listProcessesHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const processes = await getMyProcesses(req.user!.sub);
    res.json(processes);
  } catch (err) {
    next(err);
  }
}

export async function getMyProcessesHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const processes = await getMyProcesses(req.user!.sub);
    res.json(processes);
  } catch (err) {
    next(err);
  }
}

const syncSubstepSchema = substepSchema.extend({
  id: guid.optional(),
});

const syncStepSchema = z.object({
  id: guid.optional(),
  title: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  assigneeUserId: guid,
  substeps: z.array(syncSubstepSchema).default([]),
});

const syncStepsSchema = z.object({
  steps: z.array(syncStepSchema).min(1),
});

export async function syncProcessStepsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const body = syncStepsSchema.parse(req.body);

    await syncProcessSteps(id, body.steps);

    const detail = await getProcessById(id);
    res.json(detail);
  } catch (err) {
    if (err instanceof InvalidAssigneeError) {
      return next(new HttpError(400, err.message));
    }
    next(toHttpError(err) ?? err);
  }
}

export async function getProcessEventsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const events = await getProcessEvents(id);
    res.json(events);
  } catch (err) {
    next(err);
  }
}
