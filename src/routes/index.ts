import { Router } from "express";
import { authRouter } from "./auth.routes";
import { healthRouter } from "./health.routes";
import { myTasksRouter } from "./myTasks.routes";
import { processesRouter } from "./processes.routes";
import { processStepsRouter } from "./processSteps.routes";
import { processSubstepsRouter } from "./processSubsteps.routes";
import { processTemplatesRouter } from "./processTemplates.routes";
import { usersRouter } from "./users.routes";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/processes", processesRouter);
apiRouter.use("/process-steps", processStepsRouter);
apiRouter.use("/process-substeps", processSubstepsRouter);
apiRouter.use("/process-templates", processTemplatesRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/my-tasks", myTasksRouter);
