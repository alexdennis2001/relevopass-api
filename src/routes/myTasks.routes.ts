import { Router } from "express";
import { getMyTasksHandler } from "../controllers/myTasks.controller";
import { requireAuth } from "../middleware/requireAuth";

export const myTasksRouter = Router();

myTasksRouter.get("/", requireAuth, getMyTasksHandler);
