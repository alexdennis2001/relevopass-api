import { NextFunction, Request, Response } from "express";
import { getMyTasks } from "../services/processes.service";

export async function getMyTasksHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const tasks = await getMyTasks(req.user!.sub);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
}
